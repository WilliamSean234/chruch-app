import type { Prisma } from "@prisma/client";
import { audit } from "./audit";
import { EBM_GROUP } from "./ebmGroup";
import { teamKind } from "./seatRules";

type Db = Prisma.TransactionClient;

/** Jabatan Admin Tim EBM di kelompok EBM: akses penuh (menjadwalkan rapat, menulis dan memfinalkan notulen, mengelola anggota). */
export const EBM_ADMIN_POSITION = "Admin Tim EBM";
/** Nama jabatan lama (hanya boleh menjadwalkan rapat). Bila ada, diubah di tempat menjadi jabatan penuh di atas. */
const LEGACY_POSITION = "Penjadwal EBM";
const FULL = { canSchedule: true, canWriteMinutes: true, canFinalize: true, canManageMembers: true };

/** Apakah tim ini tim EBM? Dipakai untuk menentukan Admin Tim EBM. */
export async function isEbmTeam(db: Db | typeof import("./prisma").prisma, tenantId: string, teamTypeId: string | null | undefined) {
  if (!teamTypeId) return false;
  const team = await db.teamType.findFirst({ where: { id: teamTypeId, tenantId, deletedAt: null }, select: { name: true } });
  return !!team && teamKind(team.name) === "EBM";
}

/**
 * Masukkan orang ke kelompok EBM dengan jabatan "Admin Tim EBM" (akses penuh di kelompok itu).
 * Kelompok dan jabatannya dibuat bila belum ada; jabatan lama "Penjadwal EBM" dinaikkan di tempat; anggota yang sudah keluar
 * dimasukkan lagi. Jabatan lain milik orangnya tidak diubah.
 */
export async function grantEbmAdmin(db: Db, tenantId: string, personId: string, userId: string | null) {
  const groups = await db.meetingGroup.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true, sortOrder: true } });
  let group = groups.find((g) => EBM_GROUP.test(g.name.trim()));
  if (!group) {
    const nextOrder = groups.reduce((m, g) => Math.max(m, g.sortOrder), 0) + 1;
    group = await db.meetingGroup.create({ data: { tenantId, name: "EBM", sortOrder: nextOrder }, select: { id: true, name: true, sortOrder: true } });
    await audit({ tenantId, userId, action: "group.create", entity: "MeetingGroup", entityId: group.id, payload: { name: group.name, auto: "EBM" } }, db);
  }

  let position = await db.groupPosition.findFirst({ where: { groupId: group.id, name: EBM_ADMIN_POSITION } });
  if (!position) {
    const legacy = await db.groupPosition.findFirst({ where: { groupId: group.id, name: LEGACY_POSITION } });
    position = legacy
      ? await db.groupPosition.update({ where: { id: legacy.id }, data: { name: EBM_ADMIN_POSITION, deletedAt: null, ...FULL } })
      : await db.groupPosition.create({ data: { groupId: group.id, name: EBM_ADMIN_POSITION, sortOrder: 50, seats: null, ...FULL } });
  } else if (position.deletedAt) {
    position = await db.groupPosition.update({ where: { id: position.id }, data: { deletedAt: null } });
  }

  let member = await db.groupMember.findUnique({ where: { groupId_personId: { groupId: group.id, personId } } });
  if (!member) member = await db.groupMember.create({ data: { groupId: group.id, personId } });
  else if (member.leftAt) member = await db.groupMember.update({ where: { id: member.id }, data: { leftAt: null, joinedAt: new Date() } });

  const had = await db.groupMemberPosition.findUnique({ where: { memberId_positionId: { memberId: member.id, positionId: position.id } } });
  if (had) return false;
  await db.groupMemberPosition.create({ data: { memberId: member.id, positionId: position.id } });
  await audit({ tenantId, userId, action: "group.member.positions", entity: "MeetingGroup", entityId: group.id, reason: "Otomatis: Admin Tim EBM", payload: { personId, position: EBM_ADMIN_POSITION } }, db);
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
