import type { Prisma } from "@prisma/client";
import { audit } from "./audit";
import { EBM_GROUP } from "./ebmGroup";
import { teamKind } from "./seatRules";
import { ensureAdminTimPosition } from "./groupAdminTim";
import { ADMIN_TIM_POSITION } from "./groupRules";

type Db = Prisma.TransactionClient;

/** Apakah tim ini tim EBM? Dipakai untuk menentukan Admin Tim EBM. */
export async function isEbmTeam(db: Db | typeof import("./prisma").prisma, tenantId: string, teamTypeId: string | null | undefined) {
  if (!teamTypeId) return false;
  const team = await db.teamType.findFirst({ where: { id: teamTypeId, tenantId, deletedAt: null }, select: { name: true } });
  return !!team && teamKind(team.name) === "EBM";
}

/**
 * Masukkan orang ke kelompok EBM dengan jabatan wajib "Admin Tim" (akses penuh di kelompok itu).
 * Kelompok dan jabatannya dibuat bila belum ada; anggota yang sudah keluar dimasukkan lagi. Jabatan lain milik orangnya tidak diubah.
 */
export async function grantEbmAdmin(db: Db, tenantId: string, personId: string, userId: string | null) {
  const groups = await db.meetingGroup.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true, sortOrder: true } });
  let group = groups.find((g) => EBM_GROUP.test(g.name.trim()));
  if (!group) {
    const nextOrder = groups.reduce((m, g) => Math.max(m, g.sortOrder), 0) + 1;
    group = await db.meetingGroup.create({ data: { tenantId, name: "EBM", sortOrder: nextOrder }, select: { id: true, name: true, sortOrder: true } });
    await audit({ tenantId, userId, action: "group.create", entity: "MeetingGroup", entityId: group.id, payload: { name: group.name, auto: "EBM" } }, db);
  }

  const position = await ensureAdminTimPosition(db, group.id);

  let member = await db.groupMember.findUnique({ where: { groupId_personId: { groupId: group.id, personId } } });
  if (!member) member = await db.groupMember.create({ data: { groupId: group.id, personId } });
  else if (member.leftAt) member = await db.groupMember.update({ where: { id: member.id }, data: { leftAt: null, joinedAt: new Date() } });

  const had = await db.groupMemberPosition.findUnique({ where: { memberId_positionId: { memberId: member.id, positionId: position.id } } });
  if (had) return false;
  await db.groupMemberPosition.create({ data: { memberId: member.id, positionId: position.id } });
  await audit({ tenantId, userId, action: "group.member.positions", entity: "MeetingGroup", entityId: group.id, reason: "Otomatis: Admin Tim EBM", payload: { personId, position: ADMIN_TIM_POSITION } }, db);
  return true;
}

/**
 * Semua akun aktif ber-role Admin Tim untuk tim EBM diberi jabatan penuh di kelompok EBM.
 * Sifatnya menambah saja: yang berhenti jadi Admin Tim EBM tidak dikeluarkan otomatis (dikelola di halaman Kelompok).
 * @param only batasi ke orang-orang ini; tanpa ini semua akun diperiksa.
 */
export async function syncEbmAdmins(db: Db, tenantId: string, opts: { only?: string[]; userId?: string | null } = {}) {
  if (opts.only && opts.only.length === 0) return { granted: 0 };
  const users = await db.user.findMany({
    where: {
      tenantId, deletedAt: null, isActive: true, personId: opts.only ? { in: opts.only } : { not: null }, person: { deletedAt: null },
      roles: { some: { role: { code: "ADMIN_TIM" }, teamTypeId: { not: null } } },
    },
    select: { personId: true, roles: { where: { role: { code: "ADMIN_TIM" } }, select: { teamType: { select: { name: true } } } } },
  });
  let granted = 0;
  for (const x of users) {
    if (!x.personId || !x.roles.some((r) => r.teamType && teamKind(r.teamType.name) === "EBM")) continue;
    if (await grantEbmAdmin(db, tenantId, x.personId, opts.userId ?? null)) granted++;
  }
  return { granted };
}
