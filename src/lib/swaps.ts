import { z } from "zod";
import { prisma } from "./prisma";
import { badRequest, conflict, notFound } from "./errors";
import { audit } from "./audit";
import { LIMITS, rateLimit } from "./rateLimit";
import { requirePermission, requireTeamAccess, teamScope, type AuthUser } from "./rbac";
import { afterResponse, notifyUsers, userIdsForPersons } from "./notify";
import { cleanLine, showRejected, swapBlock, swapStale } from "./swapRules";
import { dayShort, hm } from "./ui";

export const swapBody = z.object({
  assignmentId: z.string().uuid(),
  reason: z.string().trim().min(3, "Tulis alasannya, minimal 3 huruf.").max(300, "Alasan terlalu panjang (maksimal 300 huruf)."),
  suggestedName: z.string().max(200).nullish(),
});
export const rejectBody = z.object({ note: z.string().max(300).nullish() });

const isUnique = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";
const when = (e: { startsAt: Date; endsAt: Date }) => `${dayShort(e.startsAt)}, ${hm(e.startsAt)}–${hm(e.endsAt)}`;

/** Pelayan meminta kursinya digantikan. Tidak mengubah jadwal; Penjadwal atau Admin Tim tim itu yang menetapkan penggantinya. */
export async function createSwap(u: AuthUser, b: z.infer<typeof swapBody>) {
  if (!u.personId) throw badRequest("Akun ini belum dihubungkan ke data orang.");
  await rateLimit(`swap:${u.userId}`, LIMITS.swapRequest);
  // hanya kursi milik sendiri; yang lain dijawab "tidak ditemukan" supaya id kursi orang tidak bisa ditebak
  const seat = await prisma.eventAssignment.findFirst({
    where: { id: b.assignmentId, tenantId: u.tenantId, personId: u.personId, event: { deletedAt: null } },
    include: { event: true, ministry: { select: { name: true } } },
  });
  if (!seat) throw notFound("Posisi");
  const block = swapBlock({ eventStatus: seat.event.status, eventKind: seat.event.kind, endsAt: seat.event.endsAt, seatPersonId: seat.personId, requesterPersonId: u.personId }, new Date());
  if (block) throw conflict(block);

  let row;
  try {
    row = await prisma.swapRequest.create({
      data: {
        tenantId: u.tenantId, eventId: seat.eventId, assignmentId: seat.id, ministryId: seat.ministryId, teamTypeId: seat.teamTypeId, requesterPersonId: u.personId,
        reason: b.reason.trim(), suggestedName: cleanLine(b.suggestedName, 80), pendingKey: seat.id,
      },
    });
  } catch (e) {
    if (isUnique(e)) throw conflict("Anda sudah mengirim permintaan untuk posisi ini. Tunggu keputusan Penjadwal atau batalkan dulu.");
    throw e;
  }
  await audit({
    tenantId: u.tenantId, userId: u.userId, action: "swap.request", entity: "EventAssignment", entityId: seat.id, reason: row.reason,
    payload: { eventId: seat.eventId, personId: u.personId, ministryId: seat.ministryId, suggestedName: row.suggestedName },
  });
  afterResponse(() => notifyApprovers(row.id));
  return { id: row.id, status: row.status };
}

/** Pelayan membatalkan permintaannya yang belum diputuskan. */
export async function cancelSwap(u: AuthUser, id: string) {
  if (!u.personId) throw notFound("Permintaan");
  const row = await prisma.swapRequest.findFirst({ where: { id, tenantId: u.tenantId, requesterPersonId: u.personId } });
  if (!row) throw notFound("Permintaan");
  if (row.status !== "PENDING") throw conflict("Permintaan ini sudah diputuskan.");
  const done = await prisma.swapRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED", pendingKey: null, decidedAt: new Date(), decidedByUserId: u.userId } });
  if (done.count === 0) throw conflict("Permintaan ini sudah diputuskan.");
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "swap.cancel", entity: "EventAssignment", entityId: row.assignmentId, payload: { eventId: row.eventId, personId: row.requesterPersonId, ministryId: row.ministryId } });
  return { id, status: "CANCELLED" };
}

/** Penjadwal atau Admin Tim tim itu menolak permintaan; pelayan diberi tahu dan tetap bertugas. */
export async function rejectSwap(u: AuthUser, id: string, b: z.infer<typeof rejectBody>) {
  requirePermission(u, "assignment.write");
  const row = await prisma.swapRequest.findFirst({ where: { id, tenantId: u.tenantId } });
  if (!row) throw notFound("Permintaan");
  requireTeamAccess(u, row.teamTypeId);
  if (row.status !== "PENDING") throw conflict("Permintaan ini sudah diputuskan.");
  const note = cleanLine(b.note, 200);
  const done = await prisma.swapRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "REJECTED", pendingKey: null, decidedAt: new Date(), decidedByUserId: u.userId, decisionNote: note } });
  if (done.count === 0) throw conflict("Permintaan ini sudah diputuskan.");
  await audit({
    tenantId: u.tenantId, userId: u.userId, action: "swap.reject", entity: "EventAssignment", entityId: row.assignmentId, reason: note,
    payload: { eventId: row.eventId, personId: row.requesterPersonId, ministryId: row.ministryId },
  });
  afterResponse(() => notifyRejected(row.id));
  return { id, status: "REJECTED" };
}

/**
 * Dipanggil setiap kursi berganti orang: permintaan terbuka dari pemegang lama otomatis dianggap disetujui.
 * Jadi Penjadwal cukup mengisi kursinya dengan cara biasa (lengkap dengan pemeriksaan bentrok) tanpa menekan tombol lain.
 * Galat di sini tidak boleh menggagalkan perubahan jadwal.
 */
export async function settleSwapsOnSeatChange(u: AuthUser, assignmentId: string, previousPersonId: string | null, newPersonId: string | null) {
  if (!previousPersonId || previousPersonId === newPersonId) return;
  try {
    await prisma.swapRequest.updateMany({
      where: { tenantId: u.tenantId, assignmentId, status: "PENDING", requesterPersonId: previousPersonId },
      data: { status: "APPROVED", pendingKey: null, decidedAt: new Date(), decidedByUserId: u.userId, replacementPersonId: newPersonId },
    });
  } catch (e) {
    console.error("[swap] gagal menandai permintaan selesai", e);
  }
}

/** Daftar permintaan terbuka untuk Penjadwal (semua tim) atau Admin Tim (timnya saja). Yang sudah tidak berlaku dibersihkan dan tidak ditampilkan. */
export async function listSwaps(u: AuthUser) {
  requirePermission(u, "assignment.write");
  const scope = teamScope(u);
  const rows = await prisma.swapRequest.findMany({
    where: { tenantId: u.tenantId, status: "PENDING", ...(scope ? { teamTypeId: { in: scope } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  if (rows.length === 0) return { items: [] };

  const [events, seats, persons, ministries, teams] = await Promise.all([
    prisma.event.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.eventId))] }, tenantId: u.tenantId }, select: { id: true, title: true, status: true, startsAt: true, endsAt: true, deletedAt: true } }),
    prisma.eventAssignment.findMany({ where: { id: { in: rows.map((r) => r.assignmentId) }, tenantId: u.tenantId }, select: { id: true, personId: true } }),
    prisma.person.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.requesterPersonId))] }, tenantId: u.tenantId }, select: { id: true, name: true } }),
    prisma.ministry.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.ministryId))] } }, select: { id: true, name: true } }),
    prisma.teamType.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.teamTypeId))] } }, select: { id: true, name: true } }),
  ]);
  const ev = new Map(events.map((e) => [e.id, e]));
  const seat = new Map(seats.map((s) => [s.id, s]));
  const name = new Map(persons.map((p) => [p.id, p.name]));
  const mini = new Map(ministries.map((m) => [m.id, m.name]));
  const team = new Map(teams.map((t) => [t.id, t.name]));

  const now = new Date();
  const stale: string[] = [];
  const items = [];
  for (const r of rows) {
    const e = ev.get(r.eventId);
    if (swapStale(r, seat.get(r.assignmentId) ?? null, e ? { status: e.status, endsAt: e.endsAt, deleted: !!e.deletedAt } : null, now)) { stale.push(r.id); continue; }
    items.push({
      id: r.id, eventId: r.eventId, eventTitle: e!.title, startsAt: e!.startsAt.toISOString(), endsAt: e!.endsAt.toISOString(),
      ministry: mini.get(r.ministryId) ?? "Posisi", team: team.get(r.teamTypeId) ?? "", requester: name.get(r.requesterPersonId) ?? "Pelayan",
      reason: r.reason, suggestedName: r.suggestedName, createdAt: r.createdAt.toISOString(),
    });
  }
  if (stale.length) await prisma.swapRequest.updateMany({ where: { id: { in: stale }, status: "PENDING" }, data: { status: "EXPIRED", pendingKey: null, decidedAt: now } }).catch((e) => console.error("[swap] gagal membersihkan", e));
  items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return { items };
}

/** Status permintaan per kursi untuk Jadwal saya: yang masih menunggu, atau yang baru ditolak (supaya pelayan tahu walau tidak menerima notifikasi). */
export async function mySwapStates(tenantId: string, personId: string, assignmentIds: string[], now = new Date()) {
  const out = new Map<string, { id: string; status: "PENDING" | "REJECTED"; suggestedName: string | null; note: string | null }>();
  if (!assignmentIds.length) return out;
  const rows = await prisma.swapRequest.findMany({
    where: { tenantId, requesterPersonId: personId, assignmentId: { in: assignmentIds }, status: { in: ["PENDING", "REJECTED"] } },
    orderBy: { createdAt: "desc" },
  });
  for (const r of rows) {
    if (out.has(r.assignmentId)) continue; // yang terbaru saja
    if (r.status === "PENDING") out.set(r.assignmentId, { id: r.id, status: "PENDING", suggestedName: r.suggestedName, note: null });
    else if (showRejected(r.decidedAt, now)) out.set(r.assignmentId, { id: r.id, status: "REJECTED", suggestedName: r.suggestedName, note: r.decisionNote });
  }
  return out;
}

/** Penerima permintaan baru: semua Penjadwal, dan Admin Tim yang memegang tim kursi itu (atau semua tim). Superadmin hanya bila tidak ada siapa pun. */
async function approverUserIds(tenantId: string, teamTypeId: string, exceptUserId: string | null) {
  const users = await prisma.user.findMany({
    where: {
      tenantId, isActive: true, deletedAt: null, ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      roles: { some: { OR: [{ role: { code: "PENJADWAL" } }, { role: { code: "ADMIN_TIM" }, OR: [{ teamTypeId: null }, { teamTypeId }] }] } },
    },
    select: { id: true },
  });
  if (users.length) return users.map((x) => x.id);
  const admins = await prisma.user.findMany({ where: { tenantId, isActive: true, deletedAt: null, roles: { some: { role: { isSuperadmin: true } } } }, select: { id: true } });
  return admins.map((x) => x.id);
}

async function notifyApprovers(swapId: string) {
  const r = await prisma.swapRequest.findUnique({ where: { id: swapId } });
  if (!r || r.status !== "PENDING") return;
  const [e, who, mini, mine] = await Promise.all([
    prisma.event.findUnique({ where: { id: r.eventId }, select: { title: true, startsAt: true, endsAt: true } }),
    prisma.person.findUnique({ where: { id: r.requesterPersonId }, select: { name: true } }),
    prisma.ministry.findUnique({ where: { id: r.ministryId }, select: { name: true } }),
    userIdsForPersons(r.tenantId, [r.requesterPersonId]),
  ]);
  if (!e) return;
  const to = await approverUserIds(r.tenantId, r.teamTypeId, mine.get(r.requesterPersonId) ?? null);
  if (!to.length) return;
  const reason = r.reason.length > 90 ? `${r.reason.slice(0, 87)}…` : r.reason;
  await notifyUsers(r.tenantId, to, {
    kind: "TUKAR_MASUK", dedupeKey: `tukar:${r.id}:baru`, url: "/jadwal",
    title: `Minta pengganti: ${e.title}`,
    body: `${who?.name ?? "Seorang pelayan"} meminta diganti sebagai ${mini?.name ?? "pelayan"} · ${when(e)}. Alasan: ${reason}`,
  });
}

async function notifyRejected(swapId: string) {
  const r = await prisma.swapRequest.findUnique({ where: { id: swapId } });
  if (!r || r.status !== "REJECTED") return;
  const [e, mini, accounts] = await Promise.all([
    prisma.event.findUnique({ where: { id: r.eventId }, select: { title: true, startsAt: true, endsAt: true } }),
    prisma.ministry.findUnique({ where: { id: r.ministryId }, select: { name: true } }),
    userIdsForPersons(r.tenantId, [r.requesterPersonId]),
  ]);
  const userId = accounts.get(r.requesterPersonId);
  if (!e || !userId) return;
  await notifyUsers(r.tenantId, [userId], {
    kind: "TUKAR_DITOLAK", dedupeKey: `tukar:${r.id}:tolak`, url: "/saya",
    title: `Permintaan pengganti ditolak: ${e.title}`,
    body: `${mini?.name ?? "Posisi"} · ${when(e)}. Anda tetap bertugas.${r.decisionNote ? ` Catatan: ${r.decisionNote}` : ""}`,
  });
}
