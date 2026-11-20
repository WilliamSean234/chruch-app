import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ApiError, badRequest, conflict, notFound } from "./errors";
import { addMinutes, DATE_RE, eachDate, matchesPattern, TIME_RE, zonedToUtc } from "./time";
import { assertRoomUsable, bookRoom, roomConflict, translateOverlap } from "./booking";
import { nextDocNumber } from "./docNumber";
import type { AuthUser } from "./rbac";
import { isSundayPair } from "./seatRules";

export const templateBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    weekday: z.number().int().min(0).max(6), // 0 = Minggu
    recurrence: z.enum(["WEEKLY", "MONTHLY_NTH"]).default("WEEKLY"),
    ordinal: z.number().int().min(1).max(5).nullish(), // 5 = yang terakhir
    startTime: z.string().regex(TIME_RE, "Format jam HH:MM"),
    durationMin: z.number().int().min(15).max(720).default(120),
    roomId: z.string().uuid(),
    attendanceModeDefault: z.enum(["COUNT", "NAMES"]).default("COUNT"),
    attendanceCommunityId: z.string().uuid().nullish(),
    slots: z
      .array(z.object({ ministryId: z.string().uuid(), count: z.number().int().min(1).max(10).default(1), rehearsalRequired: z.boolean().optional() }))
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.recurrence === "MONTHLY_NTH" && !v.ordinal) ctx.addIssue({ code: "custom", path: ["ordinal"], message: "Isi minggu ke berapa (1–4, atau 5 = terakhir)." });
    const ids = v.slots.map((s) => s.ministryId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["slots"], message: "Satu posisi cukup satu baris; pakai count untuk jumlah kursi." });
  });
export type TemplateInput = z.infer<typeof templateBody>;

const include = {
  room: true,
  attendanceCommunity: true,
  slots: { include: { ministry: { include: { teamType: true } } }, orderBy: [{ ministryId: "asc" }, { slotNo: "asc" }] },
} satisfies Prisma.EventTemplateInclude;
type TemplateFull = Prisma.EventTemplateGetPayload<{ include: typeof include }>;

const toDto = (t: TemplateFull) => {
  const byMinistry = new Map<string, { ministryId: string; ministryName: string; teamTypeId: string; teamName: string; count: number; rehearsalRequired: boolean }>();
  for (const s of t.slots) {
    const cur = byMinistry.get(s.ministryId);
    if (cur) cur.count++;
    else byMinistry.set(s.ministryId, { ministryId: s.ministryId, ministryName: s.ministry.name, teamTypeId: s.ministry.teamTypeId, teamName: s.ministry.teamType.name, count: 1, rehearsalRequired: s.rehearsalRequired });
  }
  return {
    id: t.id, name: t.name, weekday: t.weekday, recurrence: t.recurrence, ordinal: t.ordinal, startTime: t.startTime, durationMin: t.durationMin,
    room: { id: t.room.id, name: t.room.name },
    attendanceModeDefault: t.attendanceModeDefault,
    attendanceCommunity: t.attendanceCommunity ? { id: t.attendanceCommunity.id, name: t.attendanceCommunity.name } : null,
    slots: [...byMinistry.values()],
  };
};

async function resolveSlots(tenantId: string, b: TemplateInput) {
  const ministries = await prisma.ministry.findMany({ where: { id: { in: b.slots.map((s) => s.ministryId) }, tenantId, deletedAt: null } });
  if (ministries.length !== b.slots.length) throw badRequest("Ada posisi pelayanan yang tidak valid.");
  const byId = new Map(ministries.map((m) => [m.id, m]));
  return b.slots.flatMap((s) =>
    Array.from({ length: s.count }, (_, i) => ({ ministryId: s.ministryId, slotNo: i + 1, rehearsalRequired: s.rehearsalRequired ?? byId.get(s.ministryId)!.rehearsalRequiredDefault })),
  );
}

async function checkRefs(tenantId: string, b: TemplateInput) {
  await assertRoomUsable(tenantId, b.roomId);
  if (b.attendanceCommunityId && !(await prisma.community.count({ where: { id: b.attendanceCommunityId, tenantId, deletedAt: null } }))) throw badRequest("Komunitas tidak valid.");
}

export async function listTemplates(tenantId: string) {
  const rows = await prisma.eventTemplate.findMany({ where: { tenantId, deletedAt: null }, include, orderBy: { name: "asc" } });
  // Ibadah Minggu 1 dan 2 berpasangan: personelnya selalu sama, jadi bisa dibuat sekaligus.
  return rows.map((t) => {
    const pair = rows.find((o) => o.id !== t.id && isSundayPair(t.name, o.name));
    return { ...toDto(t), pair: pair ? { id: pair.id, name: pair.name } : null };
  });
}

export async function createTemplate(tenantId: string, b: TemplateInput) {
  await checkRefs(tenantId, b);
  const slots = await resolveSlots(tenantId, b);
  const old = await prisma.eventTemplate.findFirst({ where: { tenantId, name: b.name } });
  if (old && !old.deletedAt) throw conflict(`Template "${b.name}" sudah ada.`);
  const data = {
    name: b.name, weekday: b.weekday, recurrence: b.recurrence, ordinal: b.recurrence === "MONTHLY_NTH" ? b.ordinal! : null,
    startTime: b.startTime, durationMin: b.durationMin, roomId: b.roomId, attendanceModeDefault: b.attendanceModeDefault, attendanceCommunityId: b.attendanceCommunityId ?? null,
  };
  const row = await prisma.$transaction(async (tx) => {
    if (old) {
      await tx.eventTemplateSlot.deleteMany({ where: { templateId: old.id } });
      return tx.eventTemplate.update({ where: { id: old.id }, data: { ...data, deletedAt: null, slots: { create: slots } }, include });
    }
    return tx.eventTemplate.create({ data: { tenantId, ...data, slots: { create: slots } }, include });
  });
  return toDto(row);
}

/** Ubah template. Acara yang sudah dibuat dari template ini tidak ikut berubah. */
export async function updateTemplate(tenantId: string, id: string, b: TemplateInput) {
  const cur = await prisma.eventTemplate.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!cur) throw notFound("Template");
  await checkRefs(tenantId, b);
  const slots = await resolveSlots(tenantId, b);
  const dup = await prisma.eventTemplate.findFirst({ where: { tenantId, name: b.name, id: { not: id } } });
  if (dup) throw conflict(`Nama template "${b.name}" sudah dipakai.`);
  const row = await prisma.$transaction(async (tx) => {
    await tx.eventTemplateSlot.deleteMany({ where: { templateId: id } });
    return tx.eventTemplate.update({
      where: { id },
      data: {
        name: b.name, weekday: b.weekday, recurrence: b.recurrence, ordinal: b.recurrence === "MONTHLY_NTH" ? b.ordinal! : null,
        startTime: b.startTime, durationMin: b.durationMin, roomId: b.roomId, attendanceModeDefault: b.attendanceModeDefault, attendanceCommunityId: b.attendanceCommunityId ?? null,
        slots: { create: slots },
      },
      include,
    });
  });
  return toDto(row);
}

export async function deleteTemplate(tenantId: string, id: string) {
  const cur = await prisma.eventTemplate.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!cur) throw notFound("Template");
  await prisma.eventTemplate.update({ where: { id }, data: { deletedAt: new Date() } });
}

export const generateBody = z
  .object({ from: z.string().regex(DATE_RE), to: z.string().regex(DATE_RE), ignorePattern: z.boolean().optional(), withPair: z.boolean().optional() })
  .superRefine((v, ctx) => {
    if (v.ignorePattern && v.from !== v.to) ctx.addIssue({ code: "custom", path: ["ignorePattern"], message: "Di luar pola hanya untuk satu tanggal." });
    if (v.to < v.from) ctx.addIssue({ code: "custom", path: ["to"], message: "Tanggal akhir harus setelah tanggal awal." });
    const days = (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000;
    if (days > 366) ctx.addIssue({ code: "custom", path: ["to"], message: "Maksimal rentang 1 tahun." });
  });

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const ORD = (n: number | null) => (n === 5 ? "terakhir" : `ke-${n}`);
export const patternText = (t: { weekday: number; recurrence: string; ordinal: number | null }) =>
  t.recurrence === "MONTHLY_NTH" ? `hari ${DAY_NAMES[t.weekday]} ${ORD(t.ordinal)} setiap bulan` : `setiap hari ${DAY_NAMES[t.weekday]}`;
const longDate = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Buat acara DRAFT dari template untuk setiap tanggal yang cocok pola. Kursi dibuat kosong.
 * Tanggal yang sudah punya acara dari template ini dilewati; tanggal yang ruangannya bentrok dilewati dan dilaporkan.
 */
export type TplWithSlots = Prisma.EventTemplateGetPayload<{ include: { slots: { include: { ministry: true } } } }>;
export type Created = { id: string; number: string; date: string };
type Skipped = { date: string; reason: string };

/** Buat satu acara DRAFT dari template pada satu tanggal. Mengembalikan acara yang dibuat, atau alasan dilewati. */
export async function createOnDate(u: AuthUser, t: TplWithSlots, iso: string): Promise<{ created?: Created; skipped?: Skipped }> {
  const teamIds = [...new Set(t.slots.map((s) => s.ministry.teamTypeId))];
  const startsAt = zonedToUtc(iso, t.startTime);
  const endsAt = addMinutes(startsAt, t.durationMin);

  const dup = await prisma.event.findFirst({ where: { tenantId: u.tenantId, templateId: t.id, startsAt, deletedAt: null }, select: { status: true, number: true } });
  if (dup) {
    return { skipped: { date: iso, reason: dup.status === "CANCELLED" ? `Acara dari template ini sudah ada tetapi dibatalkan (${dup.number}). Buka acaranya di Jadwal acara lalu pilih "Aktifkan kembali".` : "Acara dari template ini sudah ada." } };
  }
  try {
    const busy = await roomConflict(u.tenantId, t.roomId, startsAt, endsAt);
    if (busy) throw conflict(`Ruangan sudah dipakai: ${busy.join("; ")}.`);
    const number = await nextDocNumber(u.tenantId, "EV", startsAt);
    const ev = await translateOverlap(() =>
      prisma.$transaction(async (tx) => {
        const e = await tx.event.create({
          data: {
            tenantId: u.tenantId, number, templateId: t.id, title: t.name, startsAt, endsAt, roomId: t.roomId, status: "DRAFT",
            attendanceMode: t.attendanceModeDefault, createdById: u.userId,
            teams: { create: teamIds.map((teamTypeId) => ({ teamTypeId })) },
            assignments: {
              create: t.slots.map((s, i) => ({ tenantId: u.tenantId, teamTypeId: s.ministry.teamTypeId, ministryId: s.ministryId, slotNo: s.slotNo, rehearsalRequired: s.rehearsalRequired, sortOrder: i })),
            },
          },
        });
        await bookRoom(tx, { tenantId: u.tenantId, roomId: t.roomId, startsAt, endsAt, sourceType: "EVENT", sourceId: e.id });
        return e;
      }),
    );
    return { created: { id: ev.id, number: ev.number, date: iso } };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return { skipped: { date: iso, reason: e.message } };
    throw e;
  }
}

/**
 * Buat acara DRAFT dari template untuk setiap tanggal yang cocok pola. Kursi dibuat kosong.
 * Tanggal yang sudah punya acara dari template ini dilewati; tanggal yang ruangannya bentrok dilewati dan dilaporkan.
 * `withPair`: untuk Ibadah Minggu 1 / 2, buat juga acara pasangannya di tanggal yang sama (di luar pola, karena harinya sudah pasti sama).
 */
export async function generateFromTemplate(u: AuthUser, templateId: string, range: z.infer<typeof generateBody>) {
  const t = await prisma.eventTemplate.findFirst({ where: { id: templateId, tenantId: u.tenantId, deletedAt: null }, include: { slots: { include: { ministry: true } } } });
  if (!t) throw notFound("Template");
  await assertRoomUsable(u.tenantId, t.roomId);

  const created: Created[] = [];
  const skipped: Skipped[] = [];
  const dates: string[] = [];
  let matched = 0;

  for (const d of eachDate(range.from, range.to)) {
    if (!range.ignorePattern && !matchesPattern(t, d)) continue;
    matched++;
    dates.push(d.iso);
    const r = await createOnDate(u, t, d.iso);
    if (r.created) created.push(r.created);
    if (r.skipped) skipped.push(r.skipped);
  }

  let pair: { template: string; created: Created[]; skipped: Skipped[] } | undefined;
  if (range.withPair && dates.length) {
    const all = await prisma.eventTemplate.findMany({ where: { tenantId: u.tenantId, deletedAt: null }, include: { slots: { include: { ministry: true } } } });
    const other = all.find((o) => o.id !== t.id && isSundayPair(t.name, o.name));
    if (other) {
      await assertRoomUsable(u.tenantId, other.roomId);
      pair = { template: other.name, created: [], skipped: [] };
      for (const iso of dates) {
        const r = await createOnDate(u, other, iso);
        if (r.created) pair.created.push(r.created);
        if (r.skipped) pair.skipped.push(r.skipped);
      }
    }
  }

  // Tidak ada tanggal yang cocok: jelaskan alasannya dan tawarkan tanggal terdekat yang cocok.
  let mismatch: { message: string; suggestions: string[] } | undefined;
  if (matched === 0) {
    const suggestions: string[] = [];
    const horizon = new Date(Date.parse(`${range.from}T00:00:00Z`) + 400 * 86_400_000).toISOString().slice(0, 10);
    for (const d of eachDate(range.from, horizon)) {
      if (matchesPattern(t, d)) suggestions.push(d.iso);
      if (suggestions.length === 3) break;
    }
    const single = range.from === range.to;
    mismatch = {
      message: single
        ? `${longDate(range.from)} bukan hari yang sesuai: template "${t.name}" berlaku untuk ${patternText(t)}, jadi tidak ada jadwal yang dibuat.`
        : `Tidak ada tanggal pada rentang ini yang sesuai pola template "${t.name}" (${patternText(t)}), jadi tidak ada jadwal yang dibuat.`,
      suggestions,
    };
  }
  return { template: t.name, created, skipped, mismatch, pattern: patternText(t), pair };
}
