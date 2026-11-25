import type { Prisma } from "@prisma/client";
import { openTitle } from "./meetingCrypto";
import { prisma } from "./prisma";
import { conflict, badRequest, notFound } from "./errors";
import { meetingPublicTitle } from "./meetingLabel";

export type Tx = Prisma.TransactionClient;

/** Error dari constraint btree_gist (kode Postgres 23P01). Constraint adalah penentu akhir. */
export function isOverlapError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return m.includes("booking_no_overlap") || m.includes("23P01");
}

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: process.env.APP_TIMEZONE ?? "Asia/Jakarta", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

/** Cek cepat: siapa yang sedang memakai ruangan ini pada rentang itu. Null bila kosong. */
export type ExcludeSource = string | { sourceType: string; sourceId: string } | { sourceType: string; sourceId: string }[];
const asExclude = (x?: ExcludeSource) => (typeof x === "string" ? { sourceType: "EVENT", sourceId: x } : x);

export async function roomConflict(tenantId: string, roomId: string, startsAt: Date, endsAt: Date, exclude?: ExcludeSource): Promise<string[] | null> {
  const rows = await prisma.booking.findMany({
    where: {
      tenantId, resourceType: "ROOM", resourceId: roomId, deletedAt: null, isOverride: false,
      startsAt: { lt: endsAt }, endsAt: { gt: startsAt },
      ...(exclude ? { NOT: asExclude(exclude) } : {}),
    },
    take: 3,
  });
  if (!rows.length) return null;
  const labels: string[] = [];
  for (const r of rows) {
    if (r.sourceType === "EVENT") {
      const ev = await prisma.event.findUnique({ where: { id: r.sourceId }, include: { group: { select: { name: true } } } });
      const title = ev?.kind === "RAPAT" ? meetingPublicTitle(ev.group?.name ?? "", openTitle(ev.id, ev.title), ev.showTopic) : (ev?.title ?? "Acara");
      labels.push(`${title} (${ev?.number ?? "-"}, ${fmt(r.startsAt)}–${fmt(r.endsAt).slice(-5)})`);
    } else {
      const rh = await prisma.rehearsalSession.findUnique({ where: { id: r.sourceId }, include: { event: true } });
      labels.push(`Latihan ${rh?.event.title ?? ""} (${fmt(r.startsAt)}–${fmt(r.endsAt).slice(-5)})`);
    }
  }
  return labels;
}

export async function assertRoomUsable(tenantId: string, roomId: string) {
  const room = await prisma.room.findFirst({ where: { id: roomId, tenantId, deletedAt: null } });
  if (!room) throw notFound("Ruangan");
  if (!room.isActive) throw badRequest(`Ruangan ${room.name} sedang dinonaktifkan.`);
  return room;
}

export async function assertRoomFree(tenantId: string, roomId: string, startsAt: Date, endsAt: Date, exclude?: ExcludeSource) {
  const c = await roomConflict(tenantId, roomId, startsAt, endsAt, exclude);
  if (c) throw conflict(`Ruangan sudah dipakai pada jam itu: ${c.join("; ")}.`, { conflicts: c });
}

export const bookRoom = (tx: Tx, a: { tenantId: string; roomId: string; startsAt: Date; endsAt: Date; sourceType: "EVENT" | "REHEARSAL"; sourceId: string }) =>
  tx.booking.create({ data: { tenantId: a.tenantId, resourceType: "ROOM", resourceId: a.roomId, startsAt: a.startsAt, endsAt: a.endsAt, sourceType: a.sourceType, sourceId: a.sourceId } });

/** Lepas pemakaian (soft delete) agar slot bisa dipakai lagi. */
export const releaseBookings = (tx: Tx, where: { sourceType?: string; sourceId?: string | { in: string[] }; resourceType?: string; assignmentId?: string | { in: string[] } }) =>
  tx.booking.updateMany({ where: { ...where, deletedAt: null }, data: { deletedAt: new Date() } });

/** Jalankan operasi tulis; bila constraint DB menolak (balapan dua admin), ubah menjadi pesan 409 yang ramah. */
export async function translateOverlap<T>(fn: () => Promise<T>, message = "Jadwal bentrok: orang atau ruangan yang sama sudah terpakai pada jam itu."): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isOverlapError(e)) throw conflict(message);
    throw e;
  }
}

export type Range = { startsAt: Date; endsAt: Date };
export type PersonConflict = { label: string; startsAt: Date; endsAt: Date; sameEvent: boolean; assignmentId: string | null };

const overlaps = (a: Range, b: Range) => a.startsAt < b.endsAt && a.endsAt > b.startsAt;
export const rangesOverlap = overlaps;

/**
 * Cek cepat: untuk tiap orang, pemakaian lain yang beririsan dengan rentang-rentang ini.
 * `excludeAssignmentId` = kursi yang sedang diisi (supaya tidak bentrok dengan dirinya sendiri).
 * Termasuk bentrok di acara yang sama (orang yang sama tidak boleh dua posisi sekaligus).
 */
export async function personConflicts(
  tenantId: string,
  personIds: string[],
  ranges: Range[],
  opts: { excludeAssignmentId?: string; currentEventId?: string; excludeSource?: { sourceType: string; sourceId: string } | { sourceType: string; sourceId: string }[] } = {},
): Promise<Map<string, PersonConflict[]>> {
  const out = new Map<string, PersonConflict[]>();
  if (!personIds.length || !ranges.length) return out;
  const rows = await prisma.booking.findMany({
    where: {
      tenantId, resourceType: "PERSON", resourceId: { in: personIds }, deletedAt: null, isOverride: false,
      AND: [
        { OR: ranges.map((r) => ({ startsAt: { lt: r.endsAt }, endsAt: { gt: r.startsAt } })) },
        ...(opts.excludeAssignmentId ? [{ OR: [{ assignmentId: null }, { assignmentId: { not: opts.excludeAssignmentId } }] }] : []),
        ...(opts.excludeSource ? [{ NOT: opts.excludeSource }] : []),
      ],
    },
  });
  if (!rows.length) return out;

  const asg = await prisma.eventAssignment.findMany({
    where: { id: { in: rows.map((r) => r.assignmentId).filter((x): x is string => !!x) } },
    include: { ministry: true, event: true },
  });
  const asgById = new Map(asg.map((a) => [a.id, a]));
  const rehearsals = await prisma.rehearsalSession.findMany({ where: { id: { in: rows.filter((r) => r.sourceType === "REHEARSAL").map((r) => r.sourceId) } }, include: { event: true } });
  const rehById = new Map(rehearsals.map((r) => [r.id, r]));

  for (const r of rows) {
    const a = r.assignmentId ? asgById.get(r.assignmentId) : undefined;
    let label: string;
    let sameEvent = false;
    if (r.sourceType === "REHEARSAL") {
      const rh = rehById.get(r.sourceId);
      label = `Latihan ${rh?.event.title ?? "acara lain"} (${fmt(r.startsAt)}–${fmt(r.endsAt).slice(-5)})`;
      sameEvent = !!rh && rh.eventId === opts.currentEventId;
    } else {
      sameEvent = !!a && a.eventId === opts.currentEventId;
      label = sameEvent
        ? `Sudah bertugas sebagai ${a!.ministry.name} di acara ini`
        : `${a?.event.title ?? "Acara lain"} sebagai ${a?.ministry.name ?? "petugas"} (${fmt(r.startsAt)}–${fmt(r.endsAt).slice(-5)})`;
    }
    const list = out.get(r.resourceId) ?? [];
    list.push({ label, startsAt: r.startsAt, endsAt: r.endsAt, sameEvent, assignmentId: r.assignmentId });
    out.set(r.resourceId, list);
  }
  return out;
}

/**
 * Orang yang merangkap dua kursi di acara yang sama (mis. PIC dan Usher) punya dua baris pemakaian yang beririsan:
 * baris kursi kedua ditandai override supaya tidak bentrok dengan dirinya sendiri. Bila kursi pertama dilepas, baris
 * yang tersisa harus kembali menjadi baris biasa, kalau tidak orang itu tidak akan terdeteksi bentrok di tempat lain.
 * Baris yang memang override karena bentrok dengan acara lain dibiarkan.
 */
export async function promoteOrphanOverrides(tx: Tx, tenantId: string, personId: string, eventId: string | string[]) {
  const seats = await tx.eventAssignment.findMany({ where: { eventId: Array.isArray(eventId) ? { in: eventId } : eventId, personId }, select: { id: true } });
  if (!seats.length) return;
  const rows = await tx.booking.findMany({
    where: { tenantId, resourceType: "PERSON", resourceId: personId, deletedAt: null, assignmentId: { in: seats.map((s) => s.id) } },
    orderBy: { createdAt: "asc" },
  });
  const bySource = new Map<string, typeof rows>();
  for (const r of rows) bySource.set(`${r.sourceType}:${r.sourceId}`, [...(bySource.get(`${r.sourceType}:${r.sourceId}`) ?? []), r]);
  for (const group of bySource.values()) {
    if (group.some((r) => !r.isOverride)) continue;
    const r = group[0]!;
    const clash = await tx.booking.count({
      where: { tenantId, resourceType: "PERSON", resourceId: personId, deletedAt: null, isOverride: false, id: { not: r.id }, startsAt: { lt: r.endsAt }, endsAt: { gt: r.startsAt } },
    });
    if (clash === 0) await tx.booking.update({ where: { id: r.id }, data: { isOverride: false } });
  }
}
