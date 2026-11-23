import { z } from "zod";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { can, isSuperadmin, teamScope, type AuthUser } from "./rbac";
import { EBM_GROUP } from "./ebmGroup";
import { teamKind } from "./seatRules";

/**
 * Kelompok rapat (Majelis, Pengurus Pemuda, Tim EBM, ...).
 * Aturan dasarnya: isi rapat (notulen, dokumen) hanya terbaca oleh anggota kelompok. Superadmin dan Admin lain
 * yang bukan anggota TIDAK otomatis boleh membaca. Karena itu hak di sini dihitung dari keanggotaan dan jabatan,
 * bukan dari role global. Superadmin hanya mengatur kelompok, jabatan, dan anggota (tercatat di log aktivitas).
 */

export type GroupCaps = {
  isMember: boolean;
  canSchedule: boolean;
  canWriteMinutes: boolean;
  canFinalize: boolean;
  canManageMembers: boolean;
};
const NO_CAPS: GroupCaps = { isMember: false, canSchedule: false, canWriteMinutes: false, canFinalize: false, canManageMembers: false };

const activeMember = (personId: string) => ({ personId, leftAt: null });

/** Hak seseorang di satu kelompok: gabungan dari semua jabatannya. Bukan anggota = semuanya false. */
export async function groupCaps(u: AuthUser, groupId: string): Promise<GroupCaps> {
  if (!u.personId) return NO_CAPS;
  const m = await prisma.groupMember.findFirst({
    where: { groupId, ...activeMember(u.personId), group: { tenantId: u.tenantId, deletedAt: null } },
    select: { positions: { select: { position: { select: { deletedAt: true, canSchedule: true, canWriteMinutes: true, canFinalize: true, canManageMembers: true } } } } },
  });
  if (!m) return NO_CAPS;
  const ps = m.positions.map((x) => x.position).filter((p) => !p.deletedAt);
  return {
    isMember: true,
    canSchedule: ps.some((p) => p.canSchedule),
    canWriteMinutes: ps.some((p) => p.canWriteMinutes),
    canFinalize: ps.some((p) => p.canFinalize),
    canManageMembers: ps.some((p) => p.canManageMembers),
  };
}

/** Apakah orang ini anggota aktif di kelompok mana pun (untuk menampilkan menu Kelompok/Rapat). */
export async function isInAnyGroup(u: AuthUser): Promise<boolean> {
  if (!u.personId) return false;
  const n = await prisma.groupMember.count({ where: { ...activeMember(u.personId), group: { tenantId: u.tenantId, deletedAt: null } } });
  return n > 0;
}

/**
 * Boleh melihat jadwal rapat (di kalender dan daftar): Penjadwal global, Superadmin, atau anggota kelompok mana pun.
 * Pelayan biasa yang bukan anggota kelompok tidak melihat rapat sama sekali.
 */
export async function canSeeMeetingSchedule(u: AuthUser): Promise<boolean> {
  if (isSuperadmin(u) || u.permissions.includes("event.write")) return true;
  return isInAnyGroup(u);
}

/** Apakah orang ini punya jabatan berhak "menjadwalkan" di kelompok mana pun (penjadwal kelompok). */
export async function canScheduleInAnyGroup(u: AuthUser): Promise<boolean> {
  if (!u.personId) return false;
  const n = await prisma.groupMember.count({
    where: {
      ...activeMember(u.personId),
      group: { tenantId: u.tenantId, deletedAt: null },
      positions: { some: { position: { canSchedule: true, deletedAt: null } } },
    },
  });
  return n > 0;
}

/** Superadmin saja: membuat/mengubah/menghapus kelompok dan jabatan. */
function requireSuperadmin(u: AuthUser) {
  if (!isSuperadmin(u)) throw forbidden("Hanya Superadmin yang boleh mengatur kelompok dan jabatan.");
}

/** Mengatur anggota: Superadmin, atau anggota yang jabatannya punya hak "kelola anggota". */
async function requireManageMembers(u: AuthUser, groupId: string) {
  if (isSuperadmin(u)) return;
  const caps = await groupCaps(u, groupId);
  if (!caps.canManageMembers) throw forbidden("Anda tidak punya hak mengatur anggota kelompok ini.");
}

async function findGroup(u: AuthUser, id: string) {
  const g = await prisma.meetingGroup.findFirst({ where: { id, tenantId: u.tenantId, deletedAt: null } });
  if (!g) throw notFound("Kelompok");
  return g;
}

// ───────── Bentuk data masuk ─────────
const quorum = z.number().int().min(1, "Kuorum 1 sampai 100 persen.").max(100, "Kuorum 1 sampai 100 persen.").nullable();

export const groupBody = z.object({
  name: z.string().trim().min(1, "Nama kelompok wajib diisi").max(80),
  quorumMin: quorum.optional(),
});
export const groupPatch = z.object({
  name: z.string().trim().min(1, "Nama kelompok wajib diisi").max(80).optional(),
  quorumMin: quorum.optional(),
});

const caps = {
  canSchedule: z.boolean().optional(),
  canWriteMinutes: z.boolean().optional(),
  canFinalize: z.boolean().optional(),
  canManageMembers: z.boolean().optional(),
};
/** Jumlah orang per jabatan: kosong (null) = tanpa batas. */
const seats = z.number().int("Jumlah orang harus bilangan bulat.").min(1, "Jumlah orang minimal 1.").max(500, "Jumlah orang terlalu besar.").nullable();
export const positionBody = z.object({ name: z.string().trim().min(1, "Nama jabatan wajib diisi").max(60), seats: seats.optional(), ...caps });
export const positionPatch = z.object({ name: z.string().trim().min(1, "Nama jabatan wajib diisi").max(60).optional(), seats: seats.optional(), ...caps });

export const memberBody = z.object({ personId: z.string().uuid(), positionIds: z.array(z.string().uuid()).max(20).default([]) });
export const memberPatch = z.object({ positionIds: z.array(z.string().uuid()).max(20) });

// ───────── Baca ─────────
/** Daftar kelompok yang boleh dilihat: semua untuk Superadmin, selain itu hanya kelompok yang ia ikuti. */
export async function listGroups(u: AuthUser) {
  const sa = isSuperadmin(u);
  if (!sa && !u.personId) return [];
  const rows = await prisma.meetingGroup.findMany({
    where: { tenantId: u.tenantId, deletedAt: null, ...(sa ? {} : { members: { some: activeMember(u.personId!) } }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, quorumMin: true,
      _count: { select: { members: { where: { leftAt: null } }, positions: { where: { deletedAt: null } } } },
    },
  });
  return rows.map((g) => ({ id: g.id, name: g.name, quorumMin: g.quorumMin, memberCount: g._count.members, positionCount: g._count.positions }));
}

/** Nama semua kelompok, untuk saringan di tabel Orang. Pemanggil WAJIB memastikan penggunanya berhak (person.write). */
export async function listGroupOptions(tenantId: string) {
  return prisma.meetingGroup.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}

/** Rincian satu kelompok (jabatan + anggota). Hanya Superadmin atau anggota kelompok itu. */
export async function getGroup(u: AuthUser, id: string) {
  const g = await findGroup(u, id);
  const mine = await groupCaps(u, id);
  const sa = isSuperadmin(u);
  if (!sa && !mine.isMember) throw notFound("Kelompok"); // bukan anggota: kelompok ini seolah tidak ada
  const [positions, members] = await Promise.all([
    prisma.groupPosition.findMany({ where: { groupId: id, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.groupMember.findMany({
      where: { groupId: id, leftAt: null, person: { deletedAt: null } },
      select: { id: true, personId: true, person: { select: { name: true, title: true } }, positions: { select: { positionId: true } } },
    }),
  ]);
  const order = new Map(positions.map((p, i) => [p.id, i]));
  const items = members
    .map((m) => {
      const pos = m.positions.map((x) => x.positionId).filter((pid) => order.has(pid)).sort((a, b) => order.get(a)! - order.get(b)!);
      return { id: m.id, personId: m.personId, name: m.person.name, title: m.person.title, positionIds: pos };
    })
    .sort((a, b) => (a.positionIds[0] !== undefined ? order.get(a.positionIds[0])! : 999) - (b.positionIds[0] !== undefined ? order.get(b.positionIds[0])! : 999) || a.name.localeCompare(b.name));
  const filled = new Map<string, number>(); // berapa orang memegang tiap jabatan
  for (const m of items) for (const pid of m.positionIds) filled.set(pid, (filled.get(pid) ?? 0) + 1);
  const ebm = EBM_GROUP.test(g.name.trim()) ? await ebmInfo(u, items.map((m) => m.personId)) : null;
  return {
    id: g.id,
    name: g.name,
    quorumMin: g.quorumMin,
    ebm: ebm ? { canEdit: ebm.canEdit, ministries: ebm.ministries } : null, // null = bukan kelompok EBM
    canAdmin: sa, // ubah nama/kuorum, kelola jabatan
    canManageMembers: sa || mine.canManageMembers,
    positions: positions.map((p) => ({ id: p.id, name: p.name, seats: p.seats, filled: filled.get(p.id) ?? 0, canSchedule: p.canSchedule, canWriteMinutes: p.canWriteMinutes, canFinalize: p.canFinalize, canManageMembers: p.canManageMembers })),
    members: ebm ? items.map((m) => ({ ...m, ebmMinistryIds: ebm.byPerson[m.personId] ?? [] })) : items,
  };
}

/**
 * Khusus kelompok EBM: daftar pelayanan di tim EBM dan pelayanan EBM tiap anggota.
 * `canEdit` = boleh menambah/mencabut pelayanan EBM (butuh person.write; Admin Tim hanya bila timnya EBM).
 * Perubahannya tetap divalidasi ulang di PATCH /persons/:id/ministries.
 */
async function ebmInfo(u: AuthUser, personIds: string[]) {
  const teams = (await prisma.teamType.findMany({ where: { tenantId: u.tenantId, deletedAt: null }, select: { id: true, name: true } })).filter((t) => teamKind(t.name) === "EBM");
  const ministries = teams.length
    ? await prisma.ministry.findMany({ where: { tenantId: u.tenantId, deletedAt: null, teamTypeId: { in: teams.map((t) => t.id) } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } })
    : [];
  const scope = teamScope(u);
  const canEdit = can(u, "person.write") && ministries.length > 0 && (scope === null || teams.some((t) => scope.includes(t.id)));
  const rows = ministries.length && personIds.length
    ? await prisma.personMinistry.findMany({ where: { personId: { in: personIds }, ministryId: { in: ministries.map((m) => m.id) } }, select: { personId: true, ministryId: true } })
    : [];
  const byPerson: Record<string, string[]> = {};
  for (const r of rows) (byPerson[r.personId] ??= []).push(r.ministryId);
  const order = new Map(ministries.map((m, i) => [m.id, i]));
  for (const k of Object.keys(byPerson)) byPerson[k]!.sort((a, b) => order.get(a)! - order.get(b)!);
  return { canEdit, ministries, byPerson };
}

// ───────── Kelompok ─────────
export async function createGroup(u: AuthUser, input: z.infer<typeof groupBody>) {
  requireSuperadmin(u);
  const dup = await prisma.meetingGroup.findFirst({ where: { tenantId: u.tenantId, name: input.name } });
  if (dup) throw conflict("Sudah ada kelompok dengan nama itu.");
  const last = await prisma.meetingGroup.aggregate({ where: { tenantId: u.tenantId }, _max: { sortOrder: true } });
  const g = await prisma.meetingGroup.create({
    data: {
      tenantId: u.tenantId, name: input.name, quorumMin: input.quorumMin ?? null, sortOrder: (last._max.sortOrder ?? 0) + 1,
      positions: { create: [{ name: "Anggota", sortOrder: 99 }] }, // jabatan dasar tanpa hak khusus
    },
  });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "group.create", entity: "MeetingGroup", entityId: g.id, payload: { name: g.name, quorumMin: g.quorumMin } });
  return g;
}

export async function updateGroup(u: AuthUser, id: string, input: z.infer<typeof groupPatch>) {
  requireSuperadmin(u);
  const g = await findGroup(u, id);
  if (input.name && input.name !== g.name) {
    const dup = await prisma.meetingGroup.findFirst({ where: { tenantId: u.tenantId, name: input.name, NOT: { id } } });
    if (dup) throw conflict("Sudah ada kelompok dengan nama itu.");
  }
  const row = await prisma.meetingGroup.update({
    where: { id },
    data: { ...(input.name ? { name: input.name } : {}), ...(input.quorumMin !== undefined ? { quorumMin: input.quorumMin } : {}) },
  });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "group.update", entity: "MeetingGroup", entityId: id, payload: { from: { name: g.name, quorumMin: g.quorumMin }, to: { name: row.name, quorumMin: row.quorumMin } } });
  return row;
}

/** Hapus lunak. Nama diberi akhiran supaya nama yang sama bisa dipakai lagi. */
export async function deleteGroup(u: AuthUser, id: string) {
  requireSuperadmin(u);
  const g = await findGroup(u, id);
  await prisma.meetingGroup.update({ where: { id }, data: { deletedAt: new Date(), name: `${g.name} (dihapus ${id.slice(0, 6)})` } });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "group.delete", entity: "MeetingGroup", entityId: id, payload: { name: g.name } });
}

// ───────── Jabatan ─────────
export async function createPosition(u: AuthUser, groupId: string, input: z.infer<typeof positionBody>) {
  requireSuperadmin(u);
  await findGroup(u, groupId);
  const dup = await prisma.groupPosition.findFirst({ where: { groupId, name: input.name } });
  if (dup) throw conflict("Jabatan itu sudah ada di kelompok ini.");
  const last = await prisma.groupPosition.aggregate({ where: { groupId, deletedAt: null, sortOrder: { lt: 99 } }, _max: { sortOrder: true } });
  const p = await prisma.groupPosition.create({
    data: {
      groupId, name: input.name, sortOrder: (last._max.sortOrder ?? 0) + 1, seats: input.seats === undefined ? 1 : input.seats, // jabatan baru bawaannya 1 orang
      canSchedule: input.canSchedule ?? false, canWriteMinutes: input.canWriteMinutes ?? false,
      canFinalize: input.canFinalize ?? false, canManageMembers: input.canManageMembers ?? false,
    },
  });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "group.position.create", entity: "MeetingGroup", entityId: groupId, payload: { position: p.name, seats: p.seats } });
  return p;
}

async function findPosition(groupId: string, positionId: string) {
  const p = await prisma.groupPosition.findFirst({ where: { id: positionId, groupId, deletedAt: null } });
  if (!p) throw notFound("Jabatan");
  return p;
}

export async function updatePosition(u: AuthUser, groupId: string, positionId: string, input: z.infer<typeof positionPatch>) {
  requireSuperadmin(u);
  await findGroup(u, groupId);
  const before = await findPosition(groupId, positionId);
  if (input.name && input.name !== before.name) {
    const dup = await prisma.groupPosition.findFirst({ where: { groupId, name: input.name, NOT: { id: positionId } } });
    if (dup) throw conflict("Jabatan itu sudah ada di kelompok ini.");
  }
  if (input.seats !== undefined && input.seats !== null) {
    const held = await holdersOf(positionId);
    if (held > input.seats) throw conflict(`Jabatan ${before.name} sedang dipegang ${held} orang. Kurangi dulu pemegangnya sebelum menurunkan jumlah orangnya menjadi ${input.seats}.`);
  }
  const data = {
    ...(input.name ? { name: input.name } : {}),
    ...(input.seats !== undefined ? { seats: input.seats } : {}),
    ...(input.canSchedule !== undefined ? { canSchedule: input.canSchedule } : {}),
    ...(input.canWriteMinutes !== undefined ? { canWriteMinutes: input.canWriteMinutes } : {}),
    ...(input.canFinalize !== undefined ? { canFinalize: input.canFinalize } : {}),
    ...(input.canManageMembers !== undefined ? { canManageMembers: input.canManageMembers } : {}),
  };
  const p = await prisma.groupPosition.update({ where: { id: positionId }, data });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "group.position.update", entity: "MeetingGroup", entityId: groupId, payload: { position: before.name, changes: data } });
  return p;
}

/** Hapus jabatan: dicabut dari semua anggota (hak mereka ikut hilang). Nama diberi akhiran agar bisa dipakai lagi. */
export async function deletePosition(u: AuthUser, groupId: string, positionId: string) {
  requireSuperadmin(u);
  await findGroup(u, groupId);
  const p = await findPosition(groupId, positionId);
  await prisma.$transaction([
    prisma.groupMemberPosition.deleteMany({ where: { positionId } }),
    prisma.groupPosition.update({ where: { id: positionId }, data: { deletedAt: new Date(), name: `${p.name} (dihapus ${positionId.slice(0, 6)})` } }),
  ]);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "group.position.delete", entity: "MeetingGroup", entityId: groupId, payload: { position: p.name } });
}

// ───────── Anggota ─────────
/** Berapa anggota aktif yang memegang jabatan ini. */
const holdersOf = (positionId: string, exceptMemberId?: string) =>
  prisma.groupMemberPosition.count({ where: { positionId, ...(exceptMemberId ? { memberId: { not: exceptMemberId } } : {}), member: { leftAt: null, person: { deletedAt: null } } } });

/** Tolak bila ada jabatan bertanda jumlah orang yang sudah penuh. `exceptMemberId` = anggota yang sedang diubah (pegangannya tidak dihitung dua kali). */
async function assertSeatsFree(groupId: string, positionIds: string[], exceptMemberId?: string) {
  if (!positionIds.length) return;
  const limited = await prisma.groupPosition.findMany({ where: { id: { in: positionIds }, groupId, deletedAt: null, seats: { not: null } }, select: { id: true, name: true, seats: true } });
  for (const p of limited) {
    const held = await holdersOf(p.id, exceptMemberId);
    if (held >= p.seats!) throw conflict(`Jabatan ${p.name} sudah penuh (${held} dari ${p.seats} orang). Pilih jabatan lain, atau kosongkan dulu dari pemegang yang sekarang.`);
  }
}

async function validPositionIds(groupId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length && (await prisma.groupPosition.count({ where: { id: { in: unique }, groupId, deletedAt: null } })) !== unique.length) {
    throw badRequest("Ada jabatan yang tidak valid untuk kelompok ini.");
  }
  return unique;
}

export async function addMember(u: AuthUser, groupId: string, input: z.infer<typeof memberBody>) {
  await findGroup(u, groupId);
  await requireManageMembers(u, groupId);
  const person = await prisma.person.findFirst({ where: { id: input.personId, tenantId: u.tenantId, deletedAt: null }, select: { id: true, name: true } });
  if (!person) throw badRequest("Orang tidak ditemukan.");
  const positionIds = await validPositionIds(groupId, input.positionIds);
  const existing = await prisma.groupMember.findUnique({ where: { groupId_personId: { groupId, personId: person.id } } });
  if (existing && !existing.leftAt) throw conflict(`${person.name} sudah menjadi anggota kelompok ini.`);
  await assertSeatsFree(groupId, positionIds, existing?.id);

  const member = await prisma.$transaction(async (tx) => {
    const m = existing
      ? await tx.groupMember.update({ where: { id: existing.id }, data: { leftAt: null, joinedAt: new Date() } }) // bergabung kembali
      : await tx.groupMember.create({ data: { groupId, personId: person.id } });
    await tx.groupMemberPosition.deleteMany({ where: { memberId: m.id } });
    if (positionIds.length) await tx.groupMemberPosition.createMany({ data: positionIds.map((positionId) => ({ memberId: m.id, positionId })) });
    return m;
  });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "group.member.add", entity: "MeetingGroup", entityId: groupId, payload: { personId: person.id, name: person.name, positionIds, rejoin: !!existing } });
  return member;
}

async function findMember(groupId: string, memberId: string) {
  const m = await prisma.groupMember.findFirst({ where: { id: memberId, groupId, leftAt: null }, include: { person: { select: { name: true } } } });
  if (!m) throw notFound("Anggota");
  return m;
}

export async function setMemberPositions(u: AuthUser, groupId: string, memberId: string, input: z.infer<typeof memberPatch>) {
  await findGroup(u, groupId);
  await requireManageMembers(u, groupId);
  const m = await findMember(groupId, memberId);
  const positionIds = await validPositionIds(groupId, input.positionIds);
  await assertSeatsFree(groupId, positionIds, memberId);
  await prisma.$transaction([
    prisma.groupMemberPosition.deleteMany({ where: { memberId } }),
    prisma.groupMemberPosition.createMany({ data: positionIds.map((positionId) => ({ memberId, positionId })) }),
  ]);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "group.member.positions", entity: "MeetingGroup", entityId: groupId, payload: { personId: m.personId, name: m.person.name, positionIds } });
}

/** Keluar dari kelompok: riwayat tetap tersimpan, tetapi ia tidak bisa membuka isi rapat lagi. */
export async function removeMember(u: AuthUser, groupId: string, memberId: string) {
  await findGroup(u, groupId);
  await requireManageMembers(u, groupId);
  const m = await findMember(groupId, memberId);
  await prisma.groupMember.update({ where: { id: memberId }, data: { leftAt: new Date() } });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "group.member.remove", entity: "MeetingGroup", entityId: groupId, payload: { personId: m.personId, name: m.person.name } });
}

export type MembershipChip = { groupId: string; groupName: string; positions: string[] };

/**
 * Kelompok yang diikuti beberapa orang beserta jabatannya di tiap kelompok (untuk daftar Orang dan Akun).
 * Pemanggil WAJIB memastikan penggunanya berhak mengelola data orang (person.write): keanggotaan kelompok tidak untuk umum.
 */
export async function membershipsOf(tenantId: string, personIds: string[]) {
  const out = new Map<string, MembershipChip[]>();
  if (!personIds.length) return out;
  const rows = await prisma.groupMember.findMany({
    where: { personId: { in: personIds }, leftAt: null, group: { tenantId, deletedAt: null } },
    select: {
      personId: true,
      group: { select: { id: true, name: true, sortOrder: true } },
      positions: { select: { position: { select: { name: true, sortOrder: true, deletedAt: true } } } },
    },
  });
  rows.sort((a, b) => a.group.sortOrder - b.group.sortOrder || a.group.name.localeCompare(b.group.name));
  for (const r of rows) {
    const positions = r.positions.map((x) => x.position).filter((p) => !p.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder).map((p) => p.name);
    out.set(r.personId, [...(out.get(r.personId) ?? []), { groupId: r.group.id, groupName: r.group.name, positions }]);
  }
  return out;
}
