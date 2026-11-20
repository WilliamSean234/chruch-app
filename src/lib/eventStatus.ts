import { z } from "zod";
import { prisma } from "./prisma";
import { conflict, notFound } from "./errors";
import { assertNotLocked, assertTransition } from "./eventStatusFlow";
import { assertRoomFree, assertRoomUsable, bookRoom, personConflicts, releaseBookings, translateOverlap } from "./booking";
import { getEvent } from "./events";
import { localParts } from "./time";
import type { AuthUser } from "./rbac";

export const cancelBody = z.object({ reason: z.string().trim().min(3, "Alasan pembatalan wajib diisi").max(300) });

async function load(tenantId: string, id: string) {
  const e = await prisma.event.findFirst({ where: { id, tenantId, deletedAt: null, kind: "IBADAH" } });
  if (!e) throw notFound("Acara");
  assertNotLocked(e.startsAt);
  return e;
}

/** DRAFT → PUBLISHED. Kursi kosong tidak menghalangi, tapi dilaporkan. */
export async function publishEvent(u: AuthUser, id: string) {
  const e = await load(u.tenantId, id);
  assertTransition(e.status, "PUBLISHED");
  const empty = await prisma.eventAssignment.count({ where: { eventId: id, personId: null } });
  await prisma.event.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  return { event: await getEvent(u.tenantId, id), warnings: empty ? [`Masih ada ${empty} kursi yang belum terisi.`] : [] };
}

/** PUBLISHED → DRAFT (ditarik untuk diubah). Ditolak bila kehadiran sudah tercatat. */
export async function unpublishEvent(u: AuthUser, id: string) {
  const e = await load(u.tenantId, id);
  assertTransition(e.status, "DRAFT");
  const [names, summary] = await Promise.all([prisma.eventAttendance.count({ where: { eventId: id } }), prisma.eventAttendanceSummary.count({ where: { eventId: id } })]);
  if (names + summary > 0) throw conflict("Acara tidak bisa ditarik karena kehadiran sudah dicatat.");
  await prisma.event.update({ where: { id }, data: { status: "DRAFT", publishedAt: null } });
  return getEvent(u.tenantId, id);
}

/** Batalkan acara: ruangan, orang, dan latihannya dilepas sehingga bisa dipakai acara lain. Status akhir. */
export async function cancelEvent(u: AuthUser, id: string, reason: string) {
  const e = await load(u.tenantId, id);
  assertTransition(e.status, "CANCELLED");
  const rehearsals = await prisma.rehearsalSession.findMany({ where: { eventId: id, deletedAt: null }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    await releaseBookings(tx, { sourceType: "EVENT", sourceId: id });
    if (rehearsals.length) {
      await releaseBookings(tx, { sourceType: "REHEARSAL", sourceId: { in: rehearsals.map((r) => r.id) } });
      await tx.rehearsalSession.updateMany({ where: { eventId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    }
    await tx.event.update({ where: { id }, data: { status: "CANCELLED", cancelReason: reason } });
  });
  return getEvent(u.tenantId, id);
}

/**
 * Aktifkan kembali acara yang dibatalkan: kembali ke DRAFT. Ruangan dipesan lagi (ditolak bila sudah dipakai acara lain).
 * Orang di kursinya dipesan lagi; yang sudah terjadwal di tempat lain pada jam itu dikosongkan dari kursinya dan dilaporkan,
 * supaya pengaktifan tidak menimpa jadwal orang lain. Sesi latihan yang ikut terhapus saat pembatalan tidak dipulihkan.
 */
export async function reopenEvent(u: AuthUser, id: string) {
  const e = await load(u.tenantId, id);
  assertTransition(e.status, "DRAFT");
  if (e.status !== "CANCELLED") throw conflict("Acara ini tidak sedang dibatalkan.");

  await assertRoomUsable(u.tenantId, e.roomId);
  await assertRoomFree(u.tenantId, e.roomId, e.startsAt, e.endsAt);

  const seats = await prisma.eventAssignment.findMany({ where: { eventId: id, personId: { not: null } }, include: { ministry: true, person: { select: { name: true } } }, orderBy: { sortOrder: "asc" } });
  const range = { startsAt: e.startsAt, endsAt: e.endsAt };
  const warnings: string[] = [];
  const keep: { seatId: string; personId: string; override: boolean }[] = [];
  const free: string[] = [];
  const claimed = new Set<string>(); // orang yang sudah dipakai kursi lain di acara ini (merangkap sesama acara)
  for (const s of seats) {
    const pid = s.personId!;
    const found = ((await personConflicts(u.tenantId, [pid], [range], { excludeAssignmentId: s.id, currentEventId: id })).get(pid) ?? []).filter((c) => !c.sameEvent);
    if (found.length) {
      free.push(s.id);
      warnings.push(`${s.person?.name ?? "Seseorang"} dikosongkan dari ${s.ministry.name} karena sudah terjadwal di ${found.map((c) => c.label).join("; ")}.`);
    } else {
      keep.push({ seatId: s.id, personId: pid, override: claimed.has(pid) });
      claimed.add(pid);
    }
  }

  await translateOverlap(() =>
    prisma.$transaction(async (tx) => {
      await bookRoom(tx, { tenantId: u.tenantId, roomId: e.roomId, startsAt: e.startsAt, endsAt: e.endsAt, sourceType: "EVENT", sourceId: id });
      if (free.length) await tx.eventAssignment.updateMany({ where: { id: { in: free } }, data: { personId: null } });
      if (keep.length) {
        await tx.booking.createMany({
          data: keep.map((k) => ({
            tenantId: u.tenantId, resourceType: "PERSON", resourceId: k.personId, startsAt: e.startsAt, endsAt: e.endsAt,
            sourceType: "EVENT", sourceId: id, assignmentId: k.seatId, isOverride: k.override,
          })),
        });
      }
      await tx.event.update({ where: { id }, data: { status: "DRAFT", cancelReason: null, publishedAt: null } });
    }),
  );

  const lost = await prisma.rehearsalSession.count({ where: { eventId: id, deletedAt: { not: null } } });
  if (lost) warnings.push(`Sesi latihan (${lost}) yang terhapus saat pembatalan tidak dipulihkan. Tambahkan lagi bila perlu.`);
  warnings.push(`Acara kembali berstatus draf pada ${localParts(e.startsAt).date}. Terbitkan bila sudah siap.`);
  return { event: await getEvent(u.tenantId, id), warnings };
}
