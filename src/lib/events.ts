import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { addMinutes, DATE_RE, localParts, TIME_RE, zonedToUtc } from "./time";
import { assertRoomFree, assertRoomUsable, bookRoom, promoteOrphanOverrides, releaseBookings, translateOverlap } from "./booking";
import { isSundayPair } from "./seatRules";
import { nextDocNumber } from "./docNumber";
import { creatorNames } from "./creators";
import { assertTransition, isEditable } from "./eventStatusFlow";
import { teamScope, type AuthUser } from "./rbac";
import { pageOf, pagingQuery, resolvePaging } from "./paging";

/** Teks opsional: kosong atau spasi saja = tidak ada (null). */
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
export const THEME_MAX = 600;
export const PADUS_MAX = 200;

const seatSpec = z.object({ ministryId: z.string().uuid(), count: z.number().int().min(1).max(10).default(1), rehearsalRequired: z.boolean().optional() });

export const eventCreateBody = z.object({
  title: z.string().trim().min(1).max(120),
  date: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE),
  durationMin: z.number().int().min(15).max(720).default(120),
  roomId: z.string().uuid(),
  attendanceMode: z.enum(["COUNT", "NAMES"]).default("COUNT"),
  theme: optText(THEME_MAX), // tema ibadah (opsional)
  padus: optText(PADUS_MAX), // catatan paduan suara (opsional)
  teamTypeIds: z.array(z.string().uuid()).default([]), // tim kosong tanpa kursi, mis. "Bagi roti & anggur"
  seats: z.array(seatSpec).default([]),
});

export const eventUpdateBody = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  date: z.string().regex(DATE_RE).optional(),
  startTime: z.string().regex(TIME_RE).optional(),
  durationMin: z.number().int().min(15).max(720).optional(),
  roomId: z.string().uuid().optional(),
  attendanceMode: z.enum(["COUNT", "NAMES"]).optional(),
  theme: z.string().trim().max(THEME_MAX).nullish().transform((v) => (v === undefined ? undefined : v ? v : null)), // kosong = hapus tema
  padus: z.string().trim().max(PADUS_MAX).nullish().transform((v) => (v === undefined ? undefined : v ? v : null)),
});

export const bandModeBody = z.object({ bandMode: z.enum(["BAND", "NO_BAND"]) });

export const seatBody = seatSpec;
export const teamBody = z.object({ teamTypeId: z.string().uuid() });

const include = {
  room: true,
  teams: { include: { teamType: true } },
  assignments: { include: { ministry: true, person: true }, orderBy: [{ sortOrder: "asc" }, { slotNo: "asc" }] },
  rehearsals: { where: { deletedAt: null }, include: { room: true }, orderBy: { seq: "asc" } },
} satisfies Prisma.EventInclude;
type EventFull = Prisma.EventGetPayload<{ include: typeof include }>;

export const toDto = (e: EventFull) => ({
  id: e.id, number: e.number, title: e.title, status: e.status, attendanceMode: e.attendanceMode,
  theme: e.theme, padus: e.padus, bandMode: e.bandMode,
  startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(),
  durationMin: Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000),
  room: { id: e.room.id, name: e.room.name },
  templateId: e.templateId,
  teams: e.teams.map((t) => ({ teamTypeId: t.teamTypeId, name: t.teamType.name })),
  seats: e.assignments.map((a) => ({
    id: a.id, teamTypeId: a.teamTypeId, ministryId: a.ministryId, ministryName: a.ministry.name, slotNo: a.slotNo,
    label: a.slotNo > 1 || e.assignments.filter((x) => x.ministryId === a.ministryId).length > 1 ? `${a.ministry.name} ${a.slotNo}` : a.ministry.name,
    rehearsalRequired: a.rehearsalRequired, bandOnly: a.ministry.bandOnly,
    person: a.person ? { id: a.person.id, name: a.person.name, origin: a.person.origin, originChurch: a.person.originChurch } : null,
  })),
  rehearsals: e.rehearsals.map((r) => ({ id: r.id, seq: r.seq, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), room: { id: r.room.id, name: r.room.name }, note: r.note })),
});

async function load(tenantId: string, id: string) {
  const e = await prisma.event.findFirst({ where: { id, tenantId, deletedAt: null, kind: "IBADAH" }, include });
  if (!e) throw notFound("Acara");
  return e;
}
/** Acara pasangan di hari yang sama (Ibadah Minggu 1 dan 2), lengkap dengan kursinya. Null bila tidak ada. */
export async function findPairEvent(tenantId: string, e: { id: string; templateId: string | null; startsAt: Date }) {
  if (!e.templateId) return null;
  const mine = await prisma.eventTemplate.findFirst({ where: { id: e.templateId, tenantId }, select: { name: true } });
  if (!mine) return null;
  const day = localParts(e.startsAt).date;
  const same = await prisma.event.findMany({
    where: { tenantId, deletedAt: null, kind: "IBADAH", status: { not: "CANCELLED" }, id: { not: e.id }, templateId: { not: null }, startsAt: { gte: zonedToUtc(day, "00:00"), lte: zonedToUtc(day, "23:59") } },
    include: { template: { select: { name: true } }, assignments: { select: { id: true, ministryId: true, slotNo: true, personId: true } } },
    orderBy: { startsAt: "asc" },
  });
  return same.find((x) => x.template && isSundayPair(mine.name, x.template.name)) ?? null;
}
/** Untuk tombol "Isi dari ..." dan keterangan di halaman acara. */
async function pairOf(tenantId: string, e: EventFull) {
  const hit = await findPairEvent(tenantId, e);
  return hit ? { id: hit.id, number: hit.number, title: hit.title, startsAt: hit.startsAt.toISOString(), filled: hit.assignments.filter((a) => a.personId).length } : null;
}

export const getEvent = async (tenantId: string, id: string) => {
  const e = await load(tenantId, id);
  const [names, pair] = await Promise.all([creatorNames([e.createdById]), pairOf(tenantId, e)]);
  return { ...toDto(e), createdBy: (e.createdById && names.get(e.createdById)) || null, createdAt: e.createdAt.toISOString(), pair };
};

async function loadEditable(tenantId: string, id: string) {
  const e = await load(tenantId, id);
  if (!isEditable(e.status)) throw conflict("Acara yang sudah dibatalkan tidak bisa diubah.");
  return e;
}

export const eventListQuery = z.object({
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).optional(),
  templateId: z.union([z.string().uuid(), z.literal("NONE")]).optional(), // NONE = acara satu kali (bukan dari template)
  roomId: z.string().uuid().optional(), // ruangan acara, atau ruangan salah satu sesi latihannya
  rehearsal: z.enum(["YES", "NO"]).optional(), // sudah / belum punya sesi latihan
  search: z.string().trim().max(80).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  ...pagingQuery,
});

/** Daftar acara ibadah berhalaman, lengkap dengan sesi latihan yang sudah dibentuk dan pilihan filter. */
export async function listEvents(tenantId: string, q: z.infer<typeof eventListQuery>) {
  const pg = resolvePaging(q);
  const and: Prisma.EventWhereInput[] = [];
  if (q.roomId) and.push({ OR: [{ roomId: q.roomId }, { rehearsals: { some: { roomId: q.roomId, deletedAt: null } } }] });
  if (q.search) and.push({ OR: [{ title: { contains: q.search, mode: "insensitive" } }, { number: { contains: q.search, mode: "insensitive" } }] });
  const where: Prisma.EventWhereInput = {
    tenantId, deletedAt: null, kind: "IBADAH",
    ...(q.status ? { status: q.status } : {}),
    ...(q.templateId ? { templateId: q.templateId === "NONE" ? null : q.templateId } : {}),
    ...(q.rehearsal === "YES" ? { rehearsals: { some: { deletedAt: null } } } : {}),
    ...(q.rehearsal === "NO" ? { rehearsals: { none: { deletedAt: null } } } : {}),
    ...(q.from || q.to ? { startsAt: { ...(q.from ? { gte: zonedToUtc(q.from, "00:00") } : {}), ...(q.to ? { lte: zonedToUtc(q.to, "23:59") } : {}) } } : {}),
    ...(and.length ? { AND: and } : {}),
  };
  const [total, rows, templates, rooms] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      include: {
        room: true, template: { select: { name: true } },
        assignments: { select: { personId: true } },
        rehearsals: { where: { deletedAt: null }, include: { room: true }, orderBy: { seq: "asc" } },
      },
      orderBy: { startsAt: q.order },
      skip: pg.skip, take: pg.take,
    }),
    prisma.eventTemplate.findMany({ where: { tenantId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.room.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ floor: { sort: "asc", nulls: "last" } }, { name: "asc" }], select: { id: true, name: true, floor: true } }),
  ]);
  const names = await creatorNames(rows.map((e) => e.createdById));
  const items = rows.map((e) => ({
    id: e.id, number: e.number, title: e.title, status: e.status, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(),
    templateId: e.templateId, templateName: e.template?.name ?? null,
    createdBy: (e.createdById && names.get(e.createdById)) || null,
    room: { id: e.room.id, name: e.room.name, floor: e.room.floor },
    seatsTotal: e.assignments.length, seatsFilled: e.assignments.filter((a) => a.personId).length,
    rehearsals: e.rehearsals.map((r) => ({ id: r.id, seq: r.seq, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), room: { id: r.room.id, name: r.room.name, floor: r.room.floor }, note: r.note })),
  }));
  return { ...pageOf(items, total, pg), options: { templates, rooms } };
}

async function expandSeats(tenantId: string, seats: z.infer<typeof seatSpec>[]) {
  const ids = seats.map((s) => s.ministryId);
  if (new Set(ids).size !== ids.length) throw badRequest("Satu posisi cukup satu baris; pakai count untuk jumlah kursi.");
  const ms = await prisma.ministry.findMany({ where: { id: { in: ids }, tenantId, deletedAt: null } });
  if (ms.length !== ids.length) throw badRequest("Ada posisi pelayanan yang tidak valid.");
  const byId = new Map(ms.map((m) => [m.id, m]));
  return seats.flatMap((s) => {
    const m = byId.get(s.ministryId)!;
    return Array.from({ length: s.count }, (_, i) => ({ ministryId: m.id, teamTypeId: m.teamTypeId, slotNo: i + 1, rehearsalRequired: s.rehearsalRequired ?? m.rehearsalRequiredDefault }));
  });
}

/** Acara satu kali (tidak dari template). */
export async function createEvent(u: AuthUser, b: z.infer<typeof eventCreateBody>) {
  await assertRoomUsable(u.tenantId, b.roomId);
  const startsAt = zonedToUtc(b.date, b.startTime);
  const endsAt = addMinutes(startsAt, b.durationMin);
  await assertRoomFree(u.tenantId, b.roomId, startsAt, endsAt);
  const seats = await expandSeats(u.tenantId, b.seats);
  const teamIds = [...new Set([...b.teamTypeIds, ...seats.map((s) => s.teamTypeId)])];
  if (teamIds.length && (await prisma.teamType.count({ where: { id: { in: teamIds }, tenantId: u.tenantId, deletedAt: null } })) !== teamIds.length) throw badRequest("Ada tim yang tidak valid.");

  const number = await nextDocNumber(u.tenantId, "EV", startsAt);
  const created = await translateOverlap(() =>
    prisma.$transaction(async (tx) => {
      const e = await tx.event.create({
        data: {
          tenantId: u.tenantId, number, title: b.title, startsAt, endsAt, roomId: b.roomId, status: "DRAFT", attendanceMode: b.attendanceMode, theme: b.theme, padus: b.padus, createdById: u.userId,
          teams: { create: teamIds.map((teamTypeId) => ({ teamTypeId })) },
          assignments: { create: seats.map((s, i) => ({ tenantId: u.tenantId, ...s, sortOrder: i })) },
        },
      });
      await bookRoom(tx, { tenantId: u.tenantId, roomId: b.roomId, startsAt, endsAt, sourceType: "EVENT", sourceId: e.id });
      return e;
    }),
  );
  return getEvent(u.tenantId, created.id);
}

/** Ubah judul, tema, catatan padus, waktu, ruangan, atau mode kehadiran. Pemakaian ruangan dan orang ikut dipindah. */
export async function updateEvent(u: AuthUser, id: string, b: z.infer<typeof eventUpdateBody>) {
  const cur = await loadEditable(u.tenantId, id);

  const was = localParts(cur.startsAt);
  const curDuration = Math.round((cur.endsAt.getTime() - cur.startsAt.getTime()) / 60_000);
  const startsAt = zonedToUtc(b.date ?? was.date, b.startTime ?? was.time);
  const endsAt = addMinutes(startsAt, b.durationMin ?? curDuration);
  const roomId = b.roomId ?? cur.roomId;
  const timeChanged = startsAt.getTime() !== cur.startsAt.getTime() || endsAt.getTime() !== cur.endsAt.getTime();
  const roomChanged = roomId !== cur.roomId;

  if (b.attendanceMode && b.attendanceMode !== cur.attendanceMode) {
    const [names, summary] = await Promise.all([prisma.eventAttendance.count({ where: { eventId: id } }), prisma.eventAttendanceSummary.count({ where: { eventId: id } })]);
    if (names + summary > 0) throw conflict("Mode kehadiran tidak bisa diganti karena data kehadiran sudah ada.");
  }
  if (roomChanged) await assertRoomUsable(u.tenantId, roomId);
  if (timeChanged || roomChanged) await assertRoomFree(u.tenantId, roomId, startsAt, endsAt, id);

  await translateOverlap(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.event.update({ where: { id }, data: { title: b.title, attendanceMode: b.attendanceMode, theme: b.theme, padus: b.padus, startsAt, endsAt, roomId } });
        if (timeChanged || roomChanged) {
          await releaseBookings(tx, { sourceType: "EVENT", sourceId: id, resourceType: "ROOM" });
          await bookRoom(tx, { tenantId: u.tenantId, roomId, startsAt, endsAt, sourceType: "EVENT", sourceId: id });
        }
        if (timeChanged) {
          // orang yang sudah dijadwalkan ikut pindah jam; bila ada yang bentrok, seluruh perubahan dibatalkan
          await tx.booking.updateMany({ where: { sourceType: "EVENT", sourceId: id, resourceType: "PERSON", deletedAt: null }, data: { startsAt, endsAt } });
        }
      }),
    "Waktu baru bentrok: ada pelayan di acara ini yang sudah terjadwal di tempat lain pada jam itu, atau ruangan terpakai.",
  );
  return getEvent(u.tenantId, id);
}

/**
 * Band atau No Band. No Band: hanya keyboard/piano/PSR dan sejenisnya, jadi kursi posisi band (bass, gitar, drum, …) dihapus dari acara
 * (orangnya dilepas). Band: kursi posisi band dipulihkan dari template acara bila ada. Mengembalikan jumlah kursi yang dihapus/dipulihkan.
 */
export async function setBandMode(u: AuthUser, id: string, mode: "BAND" | "NO_BAND") {
  const e = await loadEditable(u.tenantId, id);
  if (e.bandMode === mode) return { event: await getEvent(u.tenantId, id), removed: 0, restored: 0, released: [] as string[] };

  // Admin Tim hanya boleh mengubah bila mengurus tim yang punya posisi band
  const bandTeams = (await prisma.ministry.findMany({ where: { tenantId: u.tenantId, bandOnly: true, deletedAt: null }, select: { teamTypeId: true } })).map((m) => m.teamTypeId);
  const scope = teamScope(u);
  if (scope !== null && !bandTeams.some((t) => scope.includes(t))) throw forbidden();

  let removed = 0, restored = 0;
  const released: string[] = [];
  if (mode === "NO_BAND") {
    const seats = e.assignments.filter((a) => a.ministry.bandOnly);
    await prisma.$transaction(async (tx) => {
      if (seats.length) {
        await releaseBookings(tx, { assignmentId: { in: seats.map((s) => s.id) } });
        await tx.eventAssignment.deleteMany({ where: { id: { in: seats.map((s) => s.id) } } });
        for (const pid of new Set(seats.map((s) => s.personId).filter((x): x is string => !!x))) await promoteOrphanOverrides(tx, u.tenantId, pid, id);
      }
      await tx.event.update({ where: { id }, data: { bandMode: "NO_BAND" } });
    });
    removed = seats.length;
    released.push(...seats.filter((s) => s.person).map((s) => `${s.ministry.name}: ${s.person!.name}`));
  } else {
    const slots = e.templateId
      ? await prisma.eventTemplateSlot.findMany({ where: { templateId: e.templateId, ministry: { bandOnly: true, deletedAt: null } }, include: { ministry: true }, orderBy: [{ ministryId: "asc" }, { slotNo: "asc" }] })
      : [];
    const have = new Set(e.assignments.map((a) => `${a.ministryId}:${a.slotNo}`));
    const missing = slots.filter((sl) => !have.has(`${sl.ministryId}:${sl.slotNo}`));
    await prisma.$transaction(async (tx) => {
      if (missing.length) {
        const order = await tx.eventAssignment.aggregate({ where: { eventId: id }, _max: { sortOrder: true } });
        let o = (order._max.sortOrder ?? -1) + 1;
        for (const t of new Set(missing.map((m) => m.ministry.teamTypeId))) {
          if (!(await tx.eventTeam.count({ where: { eventId: id, teamTypeId: t } }))) await tx.eventTeam.create({ data: { eventId: id, teamTypeId: t } });
        }
        await tx.eventAssignment.createMany({
          data: missing.map((sl) => ({ tenantId: u.tenantId, eventId: id, teamTypeId: sl.ministry.teamTypeId, ministryId: sl.ministryId, slotNo: sl.slotNo, sortOrder: o++, rehearsalRequired: sl.rehearsalRequired })),
        });
      }
      await tx.event.update({ where: { id }, data: { bandMode: "BAND" } });
    });
    restored = missing.length;
  }
  return { event: await getEvent(u.tenantId, id), removed, restored, released };
}

export async function addTeam(u: AuthUser, eventId: string, teamTypeId: string) {
  await loadEditable(u.tenantId, eventId);
  if (!(await prisma.teamType.count({ where: { id: teamTypeId, tenantId: u.tenantId, deletedAt: null } }))) throw notFound("Tim");
  if (await prisma.eventTeam.count({ where: { eventId, teamTypeId } })) throw conflict("Tim ini sudah ada di acara.");
  await prisma.eventTeam.create({ data: { eventId, teamTypeId } });
  return getEvent(u.tenantId, eventId);
}

/** Hapus tim dari acara beserta semua kursinya; pemakaian orang di kursi itu dilepas. */
export async function removeTeam(u: AuthUser, eventId: string, teamTypeId: string) {
  await loadEditable(u.tenantId, eventId);
  const seats = await prisma.eventAssignment.findMany({ where: { eventId, teamTypeId }, select: { id: true, personId: true } });
  await prisma.$transaction(async (tx) => {
    if (seats.length) await releaseBookings(tx, { assignmentId: { in: seats.map((s) => s.id) } });
    await tx.eventAssignment.deleteMany({ where: { eventId, teamTypeId } });
    await tx.eventTeam.deleteMany({ where: { eventId, teamTypeId } });
    for (const pid of new Set(seats.map((s) => s.personId).filter((x): x is string => !!x))) await promoteOrphanOverrides(tx, u.tenantId, pid, eventId);
  });
  return getEvent(u.tenantId, eventId);
}

/** Tambah kursi (mis. Gitar 2). Tim induknya otomatis ikut ditambahkan ke acara. */
export async function addSeats(u: AuthUser, eventId: string, b: z.infer<typeof seatSpec>) {
  const ev = await loadEditable(u.tenantId, eventId);
  const m = await prisma.ministry.findFirst({ where: { id: b.ministryId, tenantId: u.tenantId, deletedAt: null } });
  if (!m) throw notFound("Posisi pelayanan");
  if (m.bandOnly && ev.bandMode === "NO_BAND") throw conflict(`Ibadah ini No Band, jadi posisi ${m.name} tidak dipakai. Ubah ke Band dulu bila perlu.`);
  await prisma.$transaction(async (tx) => {
    const last = await tx.eventAssignment.aggregate({ where: { eventId, ministryId: m.id }, _max: { slotNo: true } });
    const order = await tx.eventAssignment.aggregate({ where: { eventId }, _max: { sortOrder: true } });
    const start = (last._max.slotNo ?? 0) + 1;
    const o = (order._max.sortOrder ?? -1) + 1;
    if (!(await tx.eventTeam.count({ where: { eventId, teamTypeId: m.teamTypeId } }))) await tx.eventTeam.create({ data: { eventId, teamTypeId: m.teamTypeId } });
    await tx.eventAssignment.createMany({
      data: Array.from({ length: b.count }, (_, i) => ({
        tenantId: u.tenantId, eventId, teamTypeId: m.teamTypeId, ministryId: m.id, slotNo: start + i, sortOrder: o + i, rehearsalRequired: b.rehearsalRequired ?? m.rehearsalRequiredDefault,
      })),
    });
  });
  return getEvent(u.tenantId, eventId);
}

export async function removeSeat(u: AuthUser, eventId: string, assignmentId: string) {
  await loadEditable(u.tenantId, eventId);
  const seat = await prisma.eventAssignment.findFirst({ where: { id: assignmentId, eventId, tenantId: u.tenantId } });
  if (!seat) throw notFound("Kursi");
  await prisma.$transaction(async (tx) => {
    await releaseBookings(tx, { assignmentId });
    await tx.eventAssignment.delete({ where: { id: assignmentId } });
    if (seat.personId) await promoteOrphanOverrides(tx, u.tenantId, seat.personId, eventId);
  });
  return getEvent(u.tenantId, eventId);
}

export { assertTransition };
