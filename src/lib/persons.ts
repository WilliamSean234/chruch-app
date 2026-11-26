import { Prisma } from "@prisma/client";
import { onlineAmong, onlinePersonIds } from "./presence";
import { presenceCutoff } from "./presenceRules";
import { z } from "zod";
import { prisma } from "./prisma";
import { ApiError, badRequest, conflict, forbidden, notFound } from "./errors";
import { ageFrom, nameKey } from "./names";
import { assertCanDeactivate } from "./accountGuards";
import { forgetLiveUser } from "./liveUser";
import { can, requirePermission, requireTeamAccess, teamScope, type AuthUser } from "./rbac";
import { membershipsOf } from "./groups";
import { ebmGroupPromptFor, syncEbmGroup } from "./ebmGroup";
import { teamKind } from "./seatRules";
import { pageOf, resolvePaging, type PagingInput } from "./paging";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal YYYY-MM-DD");

export const personBody = z
  .object({
    name: z.string().trim().min(1, "Nama wajib diisi").max(120),
    title: z.string().trim().max(20).nullish(),
    nickname: z.string().trim().max(40).nullish(), // nama panggilan; undefined = tidak diubah
    aliases: z.array(z.string().trim().min(1).max(40)).max(12).optional(), // ejaan lain untuk pencocokan upload; undefined = tidak diubah
    birthDate: dateOnly.nullish(),
    gender: z.enum(["L", "P"]),
    positionId: z.string().uuid(),
    cgGroupId: z.string().uuid().nullish(),
    origin: z.enum(["DALAM", "LUAR"]).default("DALAM"),
    originChurch: z.string().trim().max(120).nullish(),
    communityIds: z.array(z.string().uuid()).default([]),
    ministryIds: z.array(z.string().uuid()).default([]),
    confirmDuplicate: z.boolean().optional(), // tetap simpan walau ada nama mirip
  })
  .superRefine((v, ctx) => {
    if (v.origin === "LUAR" && !v.originChurch) {
      ctx.addIssue({ code: "custom", path: ["originChurch"], message: "Isi gereja asal untuk orang dari luar." });
    }
  });
export type PersonInput = z.infer<typeof personBody>;

/** Ejaan lain disimpan huruf kecil, tanpa duplikat. */
const cleanAliases = (a: string[] | undefined) => [...new Set((a ?? []).map((x) => x.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean))];

const include = {
  position: true,
  cgGroup: true,
  communities: { include: { community: true } },
  ministries: { include: { ministry: { include: { teamType: true } } } },
  user: { select: { id: true, email: true, isActive: true, isOwner: true, mustChangePassword: true, roles: { select: { teamTypeId: true, role: { select: { code: true } } } } } },
} satisfies Prisma.PersonInclude;

type PersonFull = Prisma.PersonGetPayload<{ include: typeof include }>;

/** `online` (id akun yang sedang online) hanya diisi untuk daftar orang; di tempat lain status online tidak ikut dikirim. */
export const toDto = (p: PersonFull, online?: Set<string>) => ({
  id: p.id,
  name: p.name,
  title: p.title,
  nickname: p.nickname,
  aliases: p.aliases,
  birthDate: p.birthDate ? p.birthDate.toISOString().slice(0, 10) : null,
  age: ageFrom(p.birthDate),
  gender: p.gender,
  origin: p.origin,
  originChurch: p.originChurch,
  position: { id: p.position.id, name: p.position.name },
  cgGroup: p.cgGroup ? { id: p.cgGroup.id, name: p.cgGroup.name } : null,
  communities: p.communities.map((c) => ({ id: c.community.id, name: c.community.name })),
  ministries: p.ministries.map((m) => ({ id: m.ministry.id, name: m.ministry.name, teamTypeId: m.ministry.teamTypeId, teamName: m.ministry.teamType.name })),
  account: p.user
    ? {
        email: p.user.email,
        isActive: p.user.isActive,
        isOwner: p.user.isOwner,
        ...(online ? { online: online.has(p.user.id) } : {}),
        mustChangePassword: p.user.mustChangePassword,
        roleCodes: p.user.roles.map((r) => r.role.code),
        teamTypeId: p.user.roles.find((r) => r.role.code === "ADMIN_TIM")?.teamTypeId ?? null,
      }
    : null,
});

async function checkRefs(tenantId: string, b: PersonInput) {
  const pos = await prisma.personPosition.count({ where: { id: b.positionId, tenantId, deletedAt: null } });
  if (!pos) throw badRequest("Posisi tidak valid.");
  if (b.cgGroupId && !(await prisma.cgGroup.count({ where: { id: b.cgGroupId, tenantId, deletedAt: null } }))) throw badRequest("Kelompok CG tidak valid.");
  if (b.communityIds.length) {
    const n = await prisma.community.count({ where: { id: { in: b.communityIds }, tenantId, deletedAt: null } });
    if (n !== new Set(b.communityIds).size) throw badRequest("Ada komunitas yang tidak valid.");
  }
  if (b.ministryIds.length) {
    const n = await prisma.ministry.count({ where: { id: { in: b.ministryIds }, tenantId, deletedAt: null } });
    if (n !== new Set(b.ministryIds).size) throw badRequest("Ada posisi pelayanan yang tidak valid.");
  }
}

async function checkDuplicate(tenantId: string, key: string, b: PersonInput, selfId?: string) {
  if (b.confirmDuplicate) return;
  const same = await prisma.person.findMany({
    where: { tenantId, nameKey: key, deletedAt: null, ...(selfId ? { id: { not: selfId } } : {}) },
    include: { position: true },
    take: 5,
  });
  if (same.length) {
    throw new ApiError(409, "DUPLICATE_PERSON", `Sudah ada orang dengan nama mirip: ${same.map((s) => s.name).join(", ")}. Pakai data yang ada, atau kirim confirmDuplicate=true bila memang orang lain.`, {
      matches: same.map((s) => ({ id: s.id, name: s.name, birthDate: s.birthDate?.toISOString().slice(0, 10) ?? null, position: s.position.name })),
    });
  }
}

/** Admin Tim hanya boleh menambah/mencabut kemampuan di tim miliknya. */
async function checkMinistryScope(u: AuthUser, tenantId: string, ministryIds: string[]) {
  if (teamScope(u) === null || ministryIds.length === 0) return;
  const rows = await prisma.ministry.findMany({ where: { id: { in: ministryIds }, tenantId }, select: { teamTypeId: true } });
  for (const r of rows) requireTeamAccess(u, r.teamTypeId);
}

/** Tanggal lahir paling akhir (UTC, tanpa jam) untuk orang yang sekarang berusia `years` tahun. */
const bornOnOrBefore = (years: number) => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate())); };

export type PersonListQuery = PagingInput & {
  search?: string; ministryId?: string; communityId?: string; teamTypeId?: string; positionId?: string; cgGroupId?: string; role?: string;
  online?: "ON" | "OFF"; // ON = akunnya sedang online, OFF = punya akun tapi tidak online
  gender?: "L" | "P"; origin?: "DALAM" | "LUAR"; ageMin?: number; ageMax?: number;
  groupId?: string; // kelompok rapat (atau NONE = tidak di kelompok mana pun); untuk yang berhak mengelola data orang
};

/** Satu halaman orang: yang online (sesuai `where`) lebih dulu, lalu yang lain, masing-masing urut nama. Tanpa yang online, urut nama biasa. */
async function pageOnlineFirst(where: Prisma.PersonWhereInput, onlineIds: string[], pg: { skip: number; take: number }) {
  const byName = { nameKey: "asc" } as const;
  if (onlineIds.length === 0) return prisma.person.findMany({ where, include, orderBy: byName, skip: pg.skip, take: pg.take });
  const on: Prisma.PersonWhereInput = { AND: [where, { id: { in: onlineIds } }] };
  const off: Prisma.PersonWhereInput = { AND: [where, { id: { notIn: onlineIds } }] };
  const nOn = await prisma.person.count({ where: on });
  if (pg.skip >= nOn) return prisma.person.findMany({ where: off, include, orderBy: byName, skip: pg.skip - nOn, take: pg.take });
  const head = await prisma.person.findMany({ where: on, include, orderBy: byName, skip: pg.skip, take: pg.take });
  if (head.length >= pg.take) return head;
  return [...head, ...(await prisma.person.findMany({ where: off, include, orderBy: byName, take: pg.take - head.length }))];
}

export async function listPersons(u: AuthUser, q: PersonListQuery) {
  const pg = resolvePaging(q);
  if (q.role || q.online) requirePermission(u, "person.write"); // peran dan status online akun tidak untuk umum
  const seesGroups = can(u, "person.write"); // yang boleh melihat tabel Orang juga melihat kelompok dan jabatannya
  if (q.groupId && !seesGroups) throw new ApiError(403, "FORBIDDEN", "Anda tidak berhak memfilter kelompok.");
  const scope = teamScope(u);
  if (q.teamTypeId && scope !== null && !scope.includes(q.teamTypeId)) {
    throw new ApiError(403, "FORBIDDEN_TEAM", "Anda hanya boleh memfilter tim yang Anda kelola.");
  }
  const where: Prisma.PersonWhereInput = {
    tenantId: u.tenantId,
    deletedAt: null,
    ...(q.search ? { nameKey: { contains: nameKey(q.search) } } : {}),
    ...(q.positionId ? { positionId: q.positionId } : {}),
    ...(q.cgGroupId ? { cgGroupId: q.cgGroupId === "NONE" ? null : q.cgGroupId } : {}), // NONE = belum punya CG
    ...(q.communityId ? { communities: { some: { communityId: q.communityId } } } : {}),
    ...(q.ministryId ? { ministries: q.ministryId === "NONE" ? { none: {} } : { some: { ministryId: q.ministryId } } } : {}), // NONE = belum punya pelayanan
    ...(q.groupId ? { groupMemberships: q.groupId === "NONE" ? { none: { leftAt: null, group: { deletedAt: null } } } : { some: { groupId: q.groupId, leftAt: null } } } : {}),
    ...(q.gender ? { gender: q.gender } : {}),
    ...(q.origin ? { origin: q.origin } : {}),
    // usia dihitung dari tanggal lahir; yang belum diisi tanggal lahirnya tidak ikut bila filter usia dipakai
    ...(q.ageMin !== undefined || q.ageMax !== undefined
      ? { birthDate: { ...(q.ageMin !== undefined ? { lte: bornOnOrBefore(q.ageMin) } : {}), ...(q.ageMax !== undefined ? { gt: bornOnOrBefore(q.ageMax + 1) } : {}) } }
      : {}),
    ...(q.teamTypeId ? { ministries: { some: { ministry: { teamTypeId: q.teamTypeId } } } } : {}),
    ...(q.role === "NO_ACCOUNT" ? { user: { is: null } } : {}),
    ...(q.role === "NO_ROLE" ? { user: { is: { deletedAt: null, roles: { none: {} } } } } : {}),
    ...(q.role && q.role !== "NO_ACCOUNT" && q.role !== "NO_ROLE" ? { user: { is: { deletedAt: null, roles: { some: { role: { code: q.role } } } } } } : {}),
    // status online dipisah lewat AND supaya bisa dipakai bersama filter role
    ...(q.online ? { AND: [{ user: { is: { deletedAt: null, isActive: true, ...(q.online === "ON" ? { presence: { some: { seenAt: { gt: presenceCutoff() } } } } : { presence: { none: { seenAt: { gt: presenceCutoff() } } } }) } } }] } : {}),
  };
  // Yang sedang online ditaruh paling atas (tiap kelompok urut nama), untuk yang berhak melihat status online. Himpunan online diambil sekali per permintaan.
  const onlineIds = seesGroups ? await onlinePersonIds(u.tenantId) : [];
  const [total, rows] = await Promise.all([
    prisma.person.count({ where }),
    pageOnlineFirst(where, onlineIds, pg),
  ]);
  // kelompok + jabatan disertakan untuk yang berhak mengelola data orang
  const mem = seesGroups ? await membershipsOf(u.tenantId, rows.map((r) => r.id)) : null;
  const online = seesGroups ? await onlineAmong(rows.flatMap((r) => (r.user ? [r.user.id] : []))) : undefined; // titik hijau hanya untuk yang berhak melihat tabel Orang
  return pageOf(rows.map((r) => ({ ...toDto(r, online), ...(mem ? { memberships: mem.get(r.id) ?? [] } : {}) })), total, pg);
}

export async function getPerson(tenantId: string, id: string) {
  const p = await prisma.person.findFirst({ where: { id, tenantId, deletedAt: null }, include });
  if (!p) throw notFound("Orang");
  return toDto(p);
}

export async function createPerson(u: AuthUser, b: PersonInput) {
  await checkRefs(u.tenantId, b);
  const key = nameKey(b.name);
  await checkDuplicate(u.tenantId, key, b);
  await checkMinistryScope(u, u.tenantId, b.ministryIds);
  const p = await prisma.$transaction(async (tx) => {
    const created = await tx.person.create({
    data: {
      tenantId: u.tenantId,
      name: b.name,
      nameKey: key,
      title: b.title ?? null,
      nickname: b.nickname || null,
      aliases: cleanAliases(b.aliases),
      birthDate: b.birthDate ? new Date(`${b.birthDate}T00:00:00.000Z`) : null,
      gender: b.gender,
      positionId: b.positionId,
      cgGroupId: b.cgGroupId ?? null,
      origin: b.origin,
      originChurch: b.origin === "LUAR" ? b.originChurch! : null,
      communities: { create: [...new Set(b.communityIds)].map((communityId) => ({ communityId })) },
      ministries: { create: [...new Set(b.ministryIds)].map((ministryId) => ({ ministryId })) },
    },
    include,
    });
    // yang melayani di EBM otomatis masuk kelompok EBM
    await syncEbmGroup(tx, u.tenantId, { only: [created.id], rejoin: true, userId: u.userId });
    return created;
  });
  return toDto(p);
}

export async function updatePerson(u: AuthUser, id: string, b: PersonInput) {
  const cur = await prisma.person.findFirst({ where: { id, tenantId: u.tenantId, deletedAt: null }, include: { ministries: { include: { ministry: { select: { teamTypeId: true } } } } } });
  if (!cur) throw notFound("Orang");
  await checkRefs(u.tenantId, b);
  const key = nameKey(b.name);
  if (key !== cur.nameKey) await checkDuplicate(u.tenantId, key, b, id);

  const before = new Set(cur.ministries.map((m) => m.ministryId));
  const after = new Set(b.ministryIds);
  const changed = [...before].filter((x) => !after.has(x)).concat([...after].filter((x) => !before.has(x)));
  await checkMinistryScope(u, u.tenantId, changed);

  const p = await prisma.$transaction(async (tx) => {
    await tx.personCommunity.deleteMany({ where: { personId: id } });
    await tx.personMinistry.deleteMany({ where: { personId: id, ministryId: { in: [...before].filter((x) => !after.has(x)) } } });
    const updated = await tx.person.update({
      where: { id },
      data: {
        name: b.name,
        nameKey: key,
        title: b.title ?? null,
        ...(b.nickname !== undefined ? { nickname: b.nickname || null } : {}),
        ...(b.aliases !== undefined ? { aliases: cleanAliases(b.aliases) } : {}),
        birthDate: b.birthDate ? new Date(`${b.birthDate}T00:00:00.000Z`) : null,
        gender: b.gender,
        positionId: b.positionId,
        cgGroupId: b.cgGroupId ?? null,
        origin: b.origin,
        originChurch: b.origin === "LUAR" ? b.originChurch! : null,
        communities: { create: [...new Set(b.communityIds)].map((communityId) => ({ communityId })) },
        ministries: { create: [...after].filter((x) => !before.has(x)).map((ministryId) => ({ ministryId })) },
      },
      include,
    });
    if ([...after].some((x) => !before.has(x))) await syncEbmGroup(tx, u.tenantId, { only: [id], rejoin: true, userId: u.userId }); // baru ditambahkan ke satu posisi
    return updated;
  });
  return toDto(p);
}

export const ministryChangeBody = z
  .object({
    add: z.array(z.string().uuid()).max(50).default([]),
    remove: z.array(z.string().uuid()).max(50).default([]),
    ebmGroup: z.enum(["join", "skip"]).optional(), // jawaban "masukkan juga ke kelompok EBM?" untuk orang yang baru pertama kali melayani di EBM
  })
  .superRefine((v, ctx) => {
    if (v.add.length === 0 && v.remove.length === 0) ctx.addIssue({ code: "custom", path: ["add"], message: "Tidak ada pelayanan yang diubah." });
    if (v.add.some((x) => v.remove.includes(x))) ctx.addIssue({ code: "custom", path: ["add"], message: "Satu pelayanan tidak bisa ditambah dan dicabut sekaligus." });
  });
export type MinistryChange = z.infer<typeof ministryChangeBody>;

/**
 * Tambah atau cabut pelayanan satu orang tanpa menyentuh data lain. Dipakai chip pelayanan (✕ dan "+ pelayanan"):
 * hanya selisihnya yang dikirim, jadi tidak menimpa perubahan orang lain pada nama atau data lainnya.
 * Admin Tim hanya boleh mengubah pelayanan di timnya sendiri, tetapi boleh menambahkannya ke siapa pun. Mencabut hanya boleh
 * untuk Admin Tim EBM, dan hanya pelayanan di tim EBM.
 * Orang yang pertama kali diberi pelayanan EBM: server menjawab 409 EBM_GROUP_CONFIRM sampai pemanggil mengirim `ebmGroup`
 * ("join" = masukkan ke kelompok EBM, "skip" = jangan). Tidak ada yang tersimpan pada jawaban 409 itu.
 */
export async function changePersonMinistries(u: AuthUser, id: string, b: MinistryChange) {
  const cur = await prisma.person.findFirst({ where: { id, tenantId: u.tenantId, deletedAt: null }, select: { id: true, name: true } });
  if (!cur) throw notFound("Orang");
  const add = [...new Set(b.add)];
  const remove = [...new Set(b.remove)];
  const all = [...add, ...remove];
  const found = await prisma.ministry.count({ where: { id: { in: all }, tenantId: u.tenantId, deletedAt: null } });
  if (found !== all.length) throw badRequest("Ada posisi pelayanan yang tidak valid.");
  await checkMinistryScope(u, u.tenantId, all);
  // Admin Tim menambahkan orang yang sudah terdaftar ke pelayanan di timnya; mencabut hanya untuk pelayanan EBM (oleh Admin Tim EBM).
  if (remove.length && teamScope(u) !== null) {
    const rows = await prisma.ministry.findMany({ where: { id: { in: remove }, tenantId: u.tenantId }, select: { teamType: { select: { name: true } } } });
    if (rows.some((r) => teamKind(r.teamType.name) !== "EBM")) throw forbidden("Admin Tim hanya bisa mencabut pelayanan di tim EBM. Pencabutan lainnya dilakukan Penjadwal atau Superadmin.");
  }
  if (!b.ebmGroup && (await ebmGroupPromptFor(prisma, u.tenantId, id, add))) {
    throw new ApiError(409, "EBM_GROUP_CONFIRM", `${cur.name} baru pertama kali diberi pelayanan EBM. Masukkan juga ke kelompok EBM?`, { personName: cur.name });
  }

  const p = await prisma.$transaction(async (tx) => {
    if (remove.length) await tx.personMinistry.deleteMany({ where: { personId: id, ministryId: { in: remove } } });
    if (add.length) await tx.personMinistry.createMany({ data: add.map((ministryId) => ({ personId: id, ministryId })), skipDuplicates: true });
    if (add.length && b.ebmGroup === "join") await syncEbmGroup(tx, u.tenantId, { only: [id], rejoin: true, userId: u.userId }); // atas persetujuan: masuk kelompok EBM
    return tx.person.findFirstOrThrow({ where: { id }, include });
  });
  return toDto(p);
}

export async function deletePerson(tenantId: string, id: string, actorUserId?: string) {
  const p = await prisma.person.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!p) throw notFound("Orang");
  await assertCanDeactivate(tenantId, id, actorUserId); // menghapus orang menonaktifkan akunnya: jangan sampai Superadmin terakhir atau diri sendiri
  const future = await prisma.eventAssignment.count({ where: { personId: id, event: { deletedAt: null, status: { not: "CANCELLED" }, endsAt: { gte: new Date() } } } });
  if (future > 0) throw conflict(`${p.name} masih punya ${future} penugasan yang akan datang. Ganti orangnya dulu.`);
  const accounts = await prisma.user.findMany({ where: { personId: id }, select: { id: true } });
  await prisma.$transaction([
    prisma.user.updateMany({ where: { personId: id }, data: { isActive: false } }),
    prisma.person.update({ where: { id }, data: { deletedAt: new Date() } }),
  ]);
  for (const a of accounts) forgetLiveUser(a.id); // sesi yang sedang berjalan langsung ditolak, tanpa menunggu cache habis
}
