import { z } from "zod";
import { prisma } from "./prisma";
import { conflict, notFound } from "./errors";
import { assertTransition } from "./eventStatusFlow";
import { releaseBookings } from "./booking";
import { getEvent } from "./events";
import type { AuthUser } from "./rbac";

export const cancelBody = z.object({ reason: z.string().trim().min(3, "Alasan pembatalan wajib diisi").max(300) });

async function load(tenantId: string, id: string) {
  const e = await prisma.event.findFirst({ where: { id, tenantId, deletedAt: null, kind: "IBADAH" } });
  if (!e) throw notFound("Acara");
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
