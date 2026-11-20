import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { ApiError, conflict, forbidden, notFound } from "./errors";
import { can, requirePermission, type AuthUser } from "./rbac";
import { nameKey } from "./names";
import { createPerson } from "./persons";
import { attendanceWriteBlock } from "./eventStatusFlow";

export const summaryBody = z.object({ total: z.number().int().min(0).max(100000), note: z.string().trim().max(300).nullish() });
export const checkinBody = z.object({ personId: z.string().uuid() });
export const batchBody = z.object({
  add: z.array(z.string().uuid()).max(1000).default([]),
  remove: z.array(z.string().uuid()).max(1000).default([]),
});
export const guestBody = z.object({ name: z.string().trim().min(1).max(120), gender: z.enum(["L", "P"]), confirmDuplicate: z.boolean().optional() });

/**
 * Aturan akses kehadiran:
 * - perlu permission attendance.write
 * - hanya acara PUBLISHED yang bisa dicatat
 * - Superadmin/Penjadwal bebas; Petugas Absen hanya untuk acara tempat ia ditugaskan,
 *   (Penjadwal dan Superadmin boleh semua acara)
 * - diisi/diubah mulai tanggal ibadah sampai 1 bulan sesudahnya (lihat attendanceWriteBlock)
 */
async function access(u: AuthUser, eventId: string, write: boolean) {
  requirePermission(u, "attendance.write");
  const e = await prisma.event.findFirst({ where: { id: eventId, tenantId: u.tenantId, deletedAt: null, kind: "IBADAH" }, include: { template: true } });
  if (!e) throw notFound("Acara");
  if (write && e.status !== "PUBLISHED") throw conflict("Kehadiran hanya bisa dicatat untuk acara yang sudah diterbitkan.");
  if (!can(u, "event.write")) {
    const assigned = u.personId ? await prisma.eventAssignment.count({ where: { eventId, personId: u.personId } }) : 0;
    if (!assigned) throw forbidden("Anda hanya boleh mencatat kehadiran acara tempat Anda ditugaskan.");
  }
  if (write) {
    const hasData = e.attendanceMode === "COUNT"
      ? (await prisma.eventAttendanceSummary.count({ where: { eventId } })) > 0
      : (await prisma.eventAttendance.count({ where: { eventId } })) > 0;
    const block = attendanceWriteBlock(e.startsAt, hasData);
    if (block) throw conflict(block);
  }
  return e;
}

/** Keadaan kehadiran + (mode NAMES) daftar calon peserta: anggota komunitas acara, atau hasil pencarian nama. */
export async function getAttendance(u: AuthUser, eventId: string, search?: string) {
  const e = await access(u, eventId, false);
  const community = e.template?.attendanceCommunityId
    ? await prisma.community.findFirst({ where: { id: e.template.attendanceCommunityId, tenantId: u.tenantId, deletedAt: null } })
    : null;

  if (e.attendanceMode === "COUNT") {
    const s = await prisma.eventAttendanceSummary.findUnique({ where: { eventId } });
    return { mode: "COUNT" as const, status: e.status, summary: s ? { total: s.total, note: s.note, recordedAt: s.recordedAt.toISOString() } : null };
  }

  const present = await prisma.eventAttendance.findMany({ where: { eventId }, include: { person: true }, orderBy: { checkedInAt: "asc" } });
  const presentIds = new Set(present.map((p) => p.personId));
  const candidates = community
    ? await prisma.person.findMany({ where: { tenantId: u.tenantId, deletedAt: null, communities: { some: { communityId: community.id } }, ...(search ? { nameKey: { contains: nameKey(search) } } : {}) }, orderBy: { nameKey: "asc" }, take: 500 })
    : search
      ? await prisma.person.findMany({ where: { tenantId: u.tenantId, deletedAt: null, nameKey: { contains: nameKey(search) } }, orderBy: { nameKey: "asc" }, take: 50 })
      : [];
  return {
    mode: "NAMES" as const, status: e.status,
    community: community ? { id: community.id, name: community.name } : null,
    presentCount: present.length,
    present: present.map((p) => ({ personId: p.personId, name: p.person.name, checkedInAt: p.checkedInAt.toISOString() })),
    candidates: candidates.map((p) => ({ id: p.id, name: p.name, present: presentIds.has(p.id) })),
  };
}

/** Mode "jumlah saja". */
export async function setSummary(u: AuthUser, eventId: string, b: z.infer<typeof summaryBody>) {
  const e = await access(u, eventId, true);
  if (e.attendanceMode !== "COUNT") throw conflict("Acara ini memakai kehadiran per nama, bukan jumlah.");
  const s = await prisma.eventAttendanceSummary.upsert({
    where: { eventId },
    create: { tenantId: u.tenantId, eventId, total: b.total, note: b.note ?? null, recordedById: u.userId },
    update: { total: b.total, note: b.note ?? null, recordedById: u.userId, recordedAt: new Date() },
  });
  return { total: s.total, note: s.note, recordedAt: s.recordedAt.toISOString() };
}

/** Mode "per nama": tandai hadir. Mengulang aksi yang sama tidak membuat data ganda. */
export async function checkIn(u: AuthUser, eventId: string, personId: string) {
  const e = await access(u, eventId, true);
  if (e.attendanceMode !== "NAMES") throw conflict("Acara ini memakai kehadiran jumlah saja.");
  const p = await prisma.person.findFirst({ where: { id: personId, tenantId: u.tenantId, deletedAt: null } });
  if (!p) throw notFound("Orang");
  try {
    await prisma.eventAttendance.create({ data: { tenantId: u.tenantId, eventId, personId, recordedById: u.userId } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err; // sudah tercatat = tidak apa-apa
  }
  return getAttendance(u, eventId);
}

export async function undoCheckIn(u: AuthUser, eventId: string, personId: string) {
  const e = await access(u, eventId, true);
  if (e.attendanceMode !== "NAMES") throw conflict("Acara ini memakai kehadiran jumlah saja.");
  await prisma.eventAttendance.deleteMany({ where: { eventId, personId } });
  return getAttendance(u, eventId);
}

/**
 * Tamu baru: dibuat sebagai Person (supaya nama tidak dobel di kemudian hari) lalu langsung ditandai hadir.
 * Bila nama mirip sudah ada, ditolak dengan daftar kecocokan; petugas memilih orang yang ada atau memaksa dengan confirmDuplicate.
 * Pada acara berkomunitas (mis. Fellowship Pemuda) tamu otomatis menjadi anggota komunitas itu.
 */
export async function addGuest(u: AuthUser, eventId: string, b: z.infer<typeof guestBody>) {
  const e = await access(u, eventId, true);
  if (e.attendanceMode !== "NAMES") throw conflict("Acara ini memakai kehadiran jumlah saja.");
  const position = (await prisma.personPosition.findFirst({ where: { tenantId: u.tenantId, deletedAt: null, name: "Jemaat" } })) ?? (await prisma.personPosition.findFirst({ where: { tenantId: u.tenantId, deletedAt: null }, orderBy: { sortOrder: "asc" } }));
  if (!position) throw new ApiError(400, "BAD_REQUEST", "Belum ada data posisi orang. Jalankan seed.");

  const person = await createPerson(u, {
    name: b.name, title: null, birthDate: null, gender: b.gender, positionId: position.id, cgGroupId: null, origin: "DALAM", originChurch: null,
    communityIds: e.template?.attendanceCommunityId ? [e.template.attendanceCommunityId] : [], ministryIds: [], confirmDuplicate: b.confirmDuplicate,
  });
  await prisma.eventAttendance.create({ data: { tenantId: u.tenantId, eventId, personId: person.id, recordedById: u.userId } });
  return { person: { id: person.id, name: person.name }, attendance: await getAttendance(u, eventId) };
}

/**
 * Simpan sekaligus (mode per nama): tandai hadir `add`, batalkan `remove`.
 * Satu transaksi; menandai orang yang sudah hadir atau membatalkan yang belum hadir tidak menjadi masalah.
 */
export async function applyAttendance(u: AuthUser, eventId: string, b: z.infer<typeof batchBody>) {
  const e = await access(u, eventId, true);
  if (e.attendanceMode !== "NAMES") throw conflict("Acara ini memakai kehadiran jumlah saja.");
  const add = [...new Set(b.add)].filter((id) => !b.remove.includes(id));
  const remove = [...new Set(b.remove)];
  if (add.length + remove.length === 0) throw new ApiError(400, "BAD_REQUEST", "Tidak ada perubahan kehadiran.");
  if (add.length) {
    const found = await prisma.person.count({ where: { id: { in: add }, tenantId: u.tenantId, deletedAt: null } });
    if (found !== add.length) throw notFound("Orang");
  }
  await prisma.$transaction([
    ...(remove.length ? [prisma.eventAttendance.deleteMany({ where: { eventId, personId: { in: remove } } })] : []),
    ...(add.length ? [prisma.eventAttendance.createMany({ data: add.map((personId) => ({ tenantId: u.tenantId, eventId, personId, recordedById: u.userId })), skipDuplicates: true })] : []),
  ]);
  return { added: add.length, removed: remove.length, attendance: await getAttendance(u, eventId) };
}
