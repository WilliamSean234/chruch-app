import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { isSuperadmin, type AuthUser } from "./rbac";
import { forgetLiveUser } from "./liveUser";
import { assertCanDeactivate, assertRoleSeats, assertSuperadminSlot } from "./accountGuards";
import { rolesNeedingSlot } from "./roleTransferRules";
import { needsSuperadminSlot } from "./superadminLimit";
import { blockedByOwner, OWNER_MESSAGE } from "./ownerRules";
import { nameKey } from "./names";
import { pagingQuery, resolvePaging } from "./paging";
import { membershipsOf } from "./groups";
import { grantEbmAdmin, isEbmTeam } from "./ebmScheduler";
import { syncTkiGroup } from "./tkiGroup";

export const accountBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Kata sandi minimal 8 karakter").max(100),
  roleCodes: z.array(z.enum(["SUPERADMIN", "PENJADWAL", "ADMIN_TIM", "ADMIN_JEMAAT", "PETUGAS_ABSEN", "PELAYAN", "PENGAWAS"])).default([]), // kosong = hanya bisa melihat kalender dan jadwal sendiri
  teamTypeId: z.string().uuid().nullish(), // wajib bila ADMIN_TIM; Admin Tim EBM otomatis jadi Pengelola Kelompok di kelompok EBM (akses penuh)
});

/** Buat akun login dan hubungkan ke Person. Satu orang paling banyak satu akun. */
export async function createAccountForPerson(
  actor: AuthUser, personId: string, b: z.infer<typeof accountBody>,
  /** Persetujuan permintaan daftar: kata sandi sudah dipilih sendiri oleh pendaftar (hash dibawa dari permintaan), jadi tidak wajib diganti. */
  own?: { passwordHash: string },
) {
  if ((b.roleCodes.includes("SUPERADMIN") || b.roleCodes.includes("PENGAWAS")) && !isSuperadmin(actor)) throw forbidden("Hanya Superadmin yang boleh membuat Superadmin atau Pengawas.");
  if (b.roleCodes.includes("ADMIN_TIM") && !b.teamTypeId) throw badRequest("Pilih tim yang dikelola untuk Admin Tim.");
  if (b.roleCodes.includes("SUPERADMIN")) await assertSuperadminSlot(actor.tenantId); // maksimal 2 Superadmin aktif
  await assertRoleSeats(actor.tenantId, b.roleCodes); // kursi role lain (diatur Superadmin utama)

  const person = await prisma.person.findFirst({ where: { id: personId, tenantId: actor.tenantId, deletedAt: null }, include: { user: true } });
  if (!person) throw notFound("Orang");
  if (person.user) throw conflict(`${person.name} sudah punya akun (${person.user.email}).`);

  if (b.teamTypeId && !(await prisma.teamType.count({ where: { id: b.teamTypeId, tenantId: actor.tenantId, deletedAt: null } }))) {
    throw badRequest("Tim tidak valid.");
  }
  const roles = await prisma.role.findMany({ where: { tenantId: actor.tenantId, code: { in: b.roleCodes } } });
  if (roles.length !== new Set(b.roleCodes).size) throw badRequest("Role tidak ditemukan. Jalankan seed terlebih dahulu.");

  const ebmAdmin = b.roleCodes.includes("ADMIN_TIM") && (await isEbmTeam(prisma, actor.tenantId, b.teamTypeId));

  const passwordHash = own?.passwordHash ?? (await bcrypt.hash(b.password, 10));
  try {
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          tenantId: actor.tenantId,
          email: b.email,
          passwordHash,
          mustChangePassword: !own, // kata sandi awal dari admin: wajib diganti saat login pertama
          personId,
          roles: { create: roles.map((r) => ({ roleId: r.id, teamTypeId: r.code === "ADMIN_TIM" ? b.teamTypeId! : null })) },
        },
      });
      if (ebmAdmin) await grantEbmAdmin(tx, actor.tenantId, personId, actor.userId); // Admin Tim EBM: akses penuh di kelompok EBM
      if (b.roleCodes.includes("PENJADWAL")) await syncTkiGroup(tx, actor.tenantId, { only: [personId], rejoin: true, userId: actor.userId }); // Penjadwal otomatis anggota TKI
      return created;
    });
    return { id: user.id, email: user.email, roles: b.roleCodes };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("Email ini sudah dipakai akun lain.");
    throw e;
  }
}

export async function deactivateAccount(tenantId: string, personId: string, actorUserId?: string) {
  const user = await prisma.user.findFirst({ where: { personId, tenantId, deletedAt: null } });
  if (!user) throw notFound("Akun");
  await assertCanDeactivate(tenantId, personId, actorUserId);
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  forgetLiveUser(user.id);
  return user.id;
}

export const accountPatch = z
  .object({
    roleCodes: z.array(z.enum(["SUPERADMIN", "PENJADWAL", "ADMIN_TIM", "ADMIN_JEMAAT", "PETUGAS_ABSEN", "PELAYAN", "PENGAWAS"])).optional(),
    teamTypeId: z.string().uuid().nullish(),
    isActive: z.boolean().optional(),
    newPassword: z.string().min(8, "Kata sandi minimal 8 karakter").max(100).optional(), // reset oleh admin
    email: z.string().trim().toLowerCase().email("Alamat email tidak valid.").max(200).optional(), // email untuk masuk
  })
  .refine((b) => b.roleCodes !== undefined || b.isActive !== undefined || b.newPassword !== undefined || b.email !== undefined, { message: "Tidak ada yang diubah." });

/** Ubah role, aktif/nonaktif, email, atau reset kata sandi akun yang sudah ada. */
export async function updateAccount(actor: AuthUser, target: string | { userId: string }, b: z.infer<typeof accountPatch>) {
  const who = typeof target === "string" ? { personId: target } : { id: target.userId }; // string = id orang; objek = id akun
  const user = await prisma.user.findFirst({
    where: { ...who, tenantId: actor.tenantId, deletedAt: null },
    include: { roles: { include: { role: true } } },
  });
  if (!user) throw notFound("Akun");
  if (blockedByOwner(user, actor.userId)) throw forbidden(OWNER_MESSAGE); // Superadmin utama: hanya pemiliknya sendiri
  const targetIsSuper = user.roles.some((r) => r.role.isSuperadmin);
  if (targetIsSuper && !isSuperadmin(actor)) throw forbidden("Akun Superadmin hanya bisa diubah oleh Superadmin.");
  if ((b.roleCodes?.includes("SUPERADMIN") || b.roleCodes?.includes("PENGAWAS")) && !isSuperadmin(actor)) throw forbidden("Hanya Superadmin yang boleh memberi role Superadmin atau Pengawas.");
  if (b.roleCodes?.includes("ADMIN_TIM") && !b.teamTypeId) throw badRequest("Pilih tim yang dikelola untuk Admin Tim.");

  // Batas jumlah Superadmin aktif: berlaku bila perubahan ini menjadikan akun ini Superadmin aktif (baru diberi role, atau diaktifkan kembali).
  const afterIsSuper = b.roleCodes !== undefined ? b.roleCodes.includes("SUPERADMIN") : targetIsSuper;
  if (needsSuperadminSlot({ isSuper: targetIsSuper, active: user.isActive }, { isSuper: afterIsSuper, active: b.isActive ?? user.isActive })) await assertSuperadminSlot(actor.tenantId, user.id);

  // Kursi role lain: berlaku untuk role yang baru dipegang, atau semua role bila akun nonaktif diaktifkan kembali.
  const beforeCodes = user.roles.map((r) => r.role.code);
  await assertRoleSeats(actor.tenantId, rolesNeedingSlot({ codes: beforeCodes, active: user.isActive }, { codes: b.roleCodes ?? beforeCodes, active: b.isActive ?? user.isActive }), user.id);

  // Jangan sampai aplikasi kehilangan Superadmin terakhirnya.
  const losesSuper = targetIsSuper && ((b.roleCodes !== undefined && !b.roleCodes.includes("SUPERADMIN")) || b.isActive === false);
  if (losesSuper) {
    if (user.id === actor.userId) throw badRequest("Anda tidak bisa menurunkan atau menonaktifkan akun Anda sendiri.");
    const others = await prisma.user.count({
      where: { tenantId: actor.tenantId, deletedAt: null, isActive: true, id: { not: user.id }, roles: { some: { role: { isSuperadmin: true } } } },
    });
    if (others === 0) throw badRequest("Harus tersisa minimal satu Superadmin aktif.");
  }
  if (b.isActive === false && user.id === actor.userId) throw badRequest("Anda tidak bisa menonaktifkan akun Anda sendiri.");

  const data: Prisma.UserUpdateInput = {};
  const emailChanged = b.email !== undefined && b.email !== user.email.toLowerCase();
  if (emailChanged) {
    const taken = await prisma.user.findFirst({ where: { tenantId: actor.tenantId, id: { not: user.id }, email: { equals: b.email, mode: "insensitive" } }, select: { id: true } });
    if (taken) throw conflict("Email ini sudah dipakai akun lain.");
    data.email = b.email;
    data.emailVerifiedAt = null; // email baru belum dibuktikan pemiliknya
  }
  if (b.isActive !== undefined) data.isActive = b.isActive;
  if (b.newPassword) {
    data.passwordHash = await bcrypt.hash(b.newPassword, 10);
    data.mustChangePassword = true; // kata sandi dari admin selalu wajib diganti
    data.sessionsValidFrom = new Date(); // sesi lama dengan kata sandi sebelumnya tidak berlaku lagi
    data.passwordChangedAt = null;
  }

  let roleRows: { roleId: string; teamTypeId: string | null }[] | null = null;
  if (b.roleCodes !== undefined) {
    if (b.teamTypeId && !(await prisma.teamType.count({ where: { id: b.teamTypeId, tenantId: actor.tenantId, deletedAt: null } }))) throw badRequest("Tim tidak valid.");
    const roles = await prisma.role.findMany({ where: { tenantId: actor.tenantId, code: { in: b.roleCodes } } });
    if (roles.length !== new Set(b.roleCodes).size) throw badRequest("Role tidak ditemukan. Jalankan seed terlebih dahulu.");
    roleRows = roles.map((r) => ({ roleId: r.id, teamTypeId: r.code === "ADMIN_TIM" ? b.teamTypeId! : null }));
  }

  const ebmAdmin = !!user.personId && !!b.roleCodes?.includes("ADMIN_TIM") && (await isEbmTeam(prisma, actor.tenantId, b.teamTypeId));
  try {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data });
    if (roleRows) {
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userRole.createMany({ data: roleRows.map((r) => ({ userId: user.id, ...r })) });
    }
    if (ebmAdmin) await grantEbmAdmin(tx, actor.tenantId, user.personId!, actor.userId); // Admin Tim EBM: akses penuh di kelompok EBM
    if (user.personId && b.roleCodes?.includes("PENJADWAL")) await syncTkiGroup(tx, actor.tenantId, { only: [user.personId], rejoin: true, userId: actor.userId });
  });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("Email ini sudah dipakai akun lain.");
    throw e;
  }
  forgetLiveUser(user.id);
  return { id: user.id, email: emailChanged ? b.email! : user.email, emailFrom: emailChanged ? user.email : null };
}

export const passwordBody = z.object({
  currentPassword: z.string().min(1, "Isi kata sandi saat ini."),
  newPassword: z.string().min(8, "Kata sandi baru minimal 8 karakter.").max(100),
});

/** Ganti kata sandi sendiri. Menghapus tanda "wajib ganti". */
export async function changeOwnPassword(actor: AuthUser, b: z.infer<typeof passwordBody>) {
  const user = await prisma.user.findFirst({ where: { id: actor.userId, tenantId: actor.tenantId, deletedAt: null, isActive: true } });
  if (!user) throw notFound("Akun");
  if (!(await bcrypt.compare(b.currentPassword, user.passwordHash))) throw badRequest("Kata sandi saat ini salah.");
  if (b.currentPassword === b.newPassword) throw badRequest("Kata sandi baru harus berbeda dari yang lama.");
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(b.newPassword, 10), mustChangePassword: false, passwordChangedAt: new Date(), sessionsValidFrom: new Date() }, // sesi lama ikut dicabut; masuk ulang memakai kata sandi baru
  });
  forgetLiveUser(user.id);
  return user.id;
}

export const accountListQuery = z.object({
  search: z.string().trim().optional(),
  role: z.enum(["NONE", "SUPERADMIN", "PENJADWAL", "ADMIN_TIM", "ADMIN_JEMAAT", "PETUGAS_ABSEN", "PELAYAN", "PENGAWAS"]).optional(), // NONE = akun tanpa role
  status: z.enum(["active", "inactive"]).optional(),
  groupId: z.union([z.string().uuid(), z.literal("NONE")]).optional(), // kelompok rapat; NONE = tidak di kelompok mana pun
  ...pagingQuery,
});

/** Daftar semua akun login (termasuk yang tidak terhubung ke data orang, mis. Superadmin awal). */
export async function listAccounts(tenantId: string, q: z.infer<typeof accountListQuery>, opts: { withGroups?: boolean } = {}) {
  const pg = resolvePaging(q);
  const where: Prisma.UserWhereInput = {
    tenantId,
    deletedAt: null,
    AND: [{ OR: [{ personId: null }, { person: { is: { deletedAt: null } } }] }], // akun milik orang yang sudah dihapus tidak ikut ditampilkan (akunnya sudah dinonaktifkan saat orangnya dihapus)
    ...(q.status ? { isActive: q.status === "active" } : {}),
    ...(q.role === "NONE" ? { roles: { none: {} } } : q.role ? { roles: { some: { role: { code: q.role } } } } : {}),
    ...(q.search ? { OR: [{ email: { contains: q.search, mode: "insensitive" } }, { person: { nameKey: { contains: nameKey(q.search) } } }] } : {}),
    ...(q.groupId === "NONE" ? { NOT: { person: { is: { groupMemberships: { some: { leftAt: null, group: { deletedAt: null } } } } } } } : {}),
    ...(q.groupId && q.groupId !== "NONE" ? { person: { is: { groupMemberships: { some: { groupId: q.groupId, leftAt: null } } } } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ person: { name: "asc" } }, { email: "asc" }],
      skip: pg.skip,
      take: pg.take,
      select: {
        id: true, email: true, isActive: true, mustChangePassword: true, passwordChangedAt: true, createdAt: true, totpEnabledAt: true, isOwner: true,
        person: { select: { id: true, name: true, title: true } },
        roles: { select: { teamTypeId: true, teamType: { select: { name: true } }, role: { select: { code: true } } } },
      },
    }),
  ]);
  const mem = opts.withGroups ? await membershipsOf(tenantId, rows.flatMap((r) => (r.person ? [r.person.id] : []))) : null;
  return {
    total, page: pg.page, pageSize: pg.pageSize, limit: pg.pageSize, pages: Math.max(1, Math.ceil(total / pg.pageSize)),
    items: rows.map((u) => ({
      id: u.id,
      personId: u.person?.id ?? null,
      name: u.person ? (u.person.title && !u.person.name.toLowerCase().startsWith(u.person.title.toLowerCase()) ? `${u.person.title} ${u.person.name}` : u.person.name) : null,
      email: u.email,
      isActive: u.isActive,
      mustChangePassword: u.mustChangePassword,
      twoFactor: !!u.totpEnabledAt,
      isOwner: u.isOwner,
      passwordChangedAt: u.passwordChangedAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      roleCodes: u.roles.map((r) => r.role.code),
      teamTypeId: u.roles.find((r) => r.role.code === "ADMIN_TIM")?.teamTypeId ?? null,
      teamName: u.roles.find((r) => r.role.code === "ADMIN_TIM")?.teamType?.name ?? null,
      ...(mem ? { memberships: (u.person && mem.get(u.person.id)) || [] } : {}),
    })),
  };
}
