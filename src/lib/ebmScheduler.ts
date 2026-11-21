import type { Prisma } from "@prisma/client";
import { audit } from "./audit";
import { badRequest, forbidden } from "./errors";
import { EBM_GROUP } from "./ebmGroup";
import { isSuperadmin, type AuthUser } from "./rbac";
import { teamKind } from "./seatRules";

type Db = Prisma.TransactionClient;

/** Jabatan di kelompok EBM yang hanya berhak menjadwalkan rapat (tanpa hak notulen, finalisasi, atau kelola anggota). */
export const EBM_SCHEDULER_POSITION = "Penjadwal EBM";

/**
 * Pastikan permintaan "Penjadwal EBM" sah: hanya Superadmin (yang mengatur kelompok), role Admin Tim, dan timnya EBM.
 * Dipanggil sebelum akun dibuat/diubah, supaya tidak ada akun setengah jadi bila ditolak.
 */
export async function assertEbmSchedulerAllowed(db: Db | typeof import("./prisma").prisma, actor: AuthUser, roleCodes: string[], teamTypeId: string | null | undefined) {
  if (!isSuperadmin(actor)) throw forbidden("Hanya Superadmin yang boleh memberi jabatan Penjadwal EBM.");
  if (!roleCodes.includes("ADMIN_TIM") || !teamTypeId) throw badRequest("Penjadwal EBM hanya untuk Admin Tim EBM.");
  const team = await db.teamType.findFirst({ where: { id: teamTypeId, tenantId: actor.tenantId, deletedAt: null }, select: { name: true } });
  if (!team || teamKind(team.name) !== "EBM") throw badRequest("Penjadwal EBM hanya untuk Admin Tim EBM.");
}

/**
 * Masukkan orang ke kelompok EBM dengan jabatan "Penjadwal EBM" (hak menjadwalkan rapat saja).
 * Kelompok dan jabatannya dibuat bila belum ada; anggota yang sudah keluar dimasukkan lagi. Jabatan lain milik orangnya tidak diubah.
 */
export async function grantEbmScheduler(db: Db, tenantId: string, personId: string, userId: string | null) {
  const groups = await db.meetingGroup.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true, sortOrder: true } });
  let group = groups.find((g) => EBM_GROUP.test(g.name.trim()));
  if (!group) {
    const nextOrder = groups.reduce((m, g) => Math.max(m, g.sortOrder), 0) + 1;
    group = await db.meetingGroup.create({ data: { tenantId, name: "EBM", sortOrder: nextOrder }, select: { id: true, name: true, sortOrder: true } });
    await audit({ tenantId, userId, action: "group.create", entity: "MeetingGroup", entityId: group.id, payload: { name: group.name, auto: "EBM" } }, db);
  }

  let position = await db.groupPosition.findFirst({ where: { groupId: group.id, name: EBM_SCHEDULER_POSITION } });
  if (!position) {
    position = await db.groupPosition.create({ data: { groupId: group.id, name: EBM_SCHEDULER_POSITION, canSchedule: true, sortOrder: 50 } });
  } else if (position.deletedAt) {
    position = await db.groupPosition.update({ where: { id: position.id }, data: { deletedAt: null } });
  }

  let member = await db.groupMember.findUnique({ where: { groupId_personId: { groupId: group.id, personId } } });
  if (!member) member = await db.groupMember.create({ data: { groupId: group.id, personId } });
  else if (member.leftAt) member = await db.groupMember.update({ where: { id: member.id }, data: { leftAt: null, joinedAt: new Date() } });

  await db.groupMemberPosition.createMany({ data: [{ memberId: member.id, positionId: position.id }], skipDuplicates: true });
  await audit({ tenantId, userId, action: "group.member.positions", entity: "MeetingGroup", entityId: group.id, reason: "Penjadwal EBM", payload: { personId, position: EBM_SCHEDULER_POSITION } }, db);
}
