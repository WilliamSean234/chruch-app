import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma";
import { badRequest, forbidden, notFound } from "./errors";
import { isSuperadmin, type AuthUser } from "./rbac";
import { forgetLiveUser } from "./liveUser";
import { LIMITS, rateLimit } from "./rateLimit";
import { checkSecondFactor } from "./twoFactor";
import { grantEbmAdmin, isEbmTeam } from "./ebmScheduler";
import { syncTkiGroup } from "./tkiGroup";
import { blockedByOwner } from "./ownerRules";
import { audit } from "./audit";
import { effectiveLimit, LIMITABLE_ROLES, SEAT_MAX, transferVerdict, validateLimits } from "./roleTransferRules";

const ROLE_CODES = ["SUPERADMIN", "PENJADWAL", "ADMIN_TIM", "ADMIN_JEMAAT", "PETUGAS_ABSEN", "PELAYAN", "PENGAWAS"] as const;
const HOLDERS_MAX = 100; // daftar pemegang yang dikirim per role (jumlahnya tetap lengkap)

const personOk = { OR: [{ personId: null }, { person: { is: { deletedAt: null } } }] };

type Holder = { id: string; name: string | null; email: string; isOwner: boolean; teamName: string | null; locked: boolean };

/**
 * Ringkasan role untuk dialog Ubah role: berapa akun aktif memegang tiap role (n), batasnya bila ada (x), siapa saja pemegangnya,
 * dan apakah pemanggil boleh memindahkan role itu. Pengawas dan Superadmin hanya dilihat Superadmin.
 */
export async function roleSummary(actor: AuthUser) {
  const sup = isSuperadmin(actor);
  const me = await prisma.user.findFirst({ where: { id: actor.userId, tenantId: actor.tenantId, deletedAt: null }, select: { isOwner: true, totpEnabledAt: true } });
  const users = await prisma.user.findMany({
    where: { tenantId: actor.tenantId, deletedAt: null, isActive: true, roles: { some: {} }, ...personOk },
    orderBy: [{ person: { name: "asc" } }, { email: "asc" }],
    select: { id: true, email: true, isOwner: true, person: { select: { name: true } }, roles: { select: { role: { select: { code: true, isSuperadmin: true } }, teamType: { select: { name: true } } } } },
  });
  const stored = new Map((await prisma.role.findMany({ where: { tenantId: actor.tenantId }, select: { code: true, maxAccounts: true } })).map((r) => [r.code, r.maxAccounts]));
  const codes = ROLE_CODES.filter((c) => sup || (c !== "SUPERADMIN" && c !== "PENGAWAS"));
  const roles = codes.map((code) => {
    const rows = users.filter((u) => u.roles.some((r) => r.role.code === code));
    const holders: Holder[] = rows.slice(0, HOLDERS_MAX).map((u) => ({
      id: u.id, name: u.person?.name ?? null, email: u.email, isOwner: u.isOwner,
      teamName: code === "ADMIN_TIM" ? u.roles.find((r) => r.role.code === "ADMIN_TIM")?.teamType?.name ?? null : null,
      locked: blockedByOwner(u, actor.userId) || (!sup && u.roles.some((r) => r.role.isSuperadmin)),
    }));
    const isSuperRole = code === "SUPERADMIN";
    const canTransfer = isSuperRole ? sup && !!me?.isOwner : true;
    return {
      code, count: rows.length, max: effectiveLimit(code, stored.get(code)), limitable: (LIMITABLE_ROLES as readonly string[]).includes(code), holders, canTransfer,
      transferNote: canTransfer ? null : "Hanya Superadmin utama yang bisa memindahkan role Superadmin.",
    };
  });
  return { roles, viewerTwoFactor: !!me?.totpEnabledAt, canSetLimits: sup && !!me?.isOwner };
}

export const transferBody = z.object({
  role: z.enum(ROLE_CODES),
  fromUserId: z.string().uuid(),
  toUserId: z.string().uuid(),
  password: z.string().max(100).optional(), // wajib untuk Superadmin
  code: z.string().trim().max(40).optional(), // kode 2 langkah pemanggil, wajib bila 2 langkahnya aktif (Superadmin)
});

/**
 * Pindahkan satu role dari akun A ke akun B dalam satu transaksi (A kehilangan, B mendapat). Jumlah pemegang tidak berubah,
 * jadi role yang penuh pun bisa dipindah. Role Superadmin diperketat: hanya Superadmin utama, dan harus memasukkan kata sandi
 * (serta kode 2 langkah bila aktif) lagi; sesi akun asal langsung dicabut.
 */
export async function transferRole(actor: AuthUser, b: z.infer<typeof transferBody>) {
  const isSuperRole = b.role === "SUPERADMIN";
  const load = (id: string) => prisma.user.findFirst({ where: { id, tenantId: actor.tenantId, deletedAt: null, ...personOk }, include: { roles: { include: { role: true } } } });
  const [from, to, me, role] = await Promise.all([
    load(b.fromUserId), load(b.toUserId),
    prisma.user.findFirst({ where: { id: actor.userId, tenantId: actor.tenantId, deletedAt: null, isActive: true }, select: { id: true, isOwner: true, passwordHash: true, totpSecret: true, totpEnabledAt: true, recoveryHashes: true } }),
    prisma.role.findFirst({ where: { tenantId: actor.tenantId, code: b.role } }),
  ]);
  if (!from || !to || !me) throw notFound("Akun");
  if (!role) throw badRequest("Role tidak ditemukan. Jalankan seed terlebih dahulu.");

  const party = (u: NonNullable<typeof from>) => ({ id: u.id, isActive: u.isActive, isOwner: u.isOwner, isSuper: u.roles.some((r) => r.role.isSuperadmin), holds: u.roles.some((r) => r.role.code === b.role) });
  const verdict = transferVerdict(b.role, { id: actor.userId, isSuper: isSuperadmin(actor), isOwner: me.isOwner }, party(from), party(to));
  if (verdict) throw badRequest(verdict);

  if (isSuperRole) {
    await rateLimit(`role-transfer:${actor.userId}`, LIMITS.roleTransfer);
    if (!b.password) throw badRequest("Masukkan kata sandi Anda untuk memindahkan role Superadmin.");
    if (!(await bcrypt.compare(b.password, me.passwordHash))) throw badRequest("Kata sandi salah.");
    if (me.totpEnabledAt) {
      if (!b.code) throw badRequest("Masukkan kode verifikasi 2 langkah Anda.");
      if (!(await checkSecondFactor({ id: me.id, totpSecret: me.totpSecret, recoveryHashes: me.recoveryHashes }, b.code))) throw badRequest("Kode 2 langkah salah atau sudah dipakai. Tunggu kode baru muncul di aplikasi.");
    }
  }

  const teams = from.roles.filter((r) => r.role.code === b.role).map((r) => r.teamTypeId);
  const ebmAdmin = !!to.personId && b.role === "ADMIN_TIM" && (await Promise.all(teams.map((t) => isEbmTeam(prisma, actor.tenantId, t)))).some(Boolean);
  await prisma.$transaction(async (tx) => {
    await tx.userRole.deleteMany({ where: { userId: from.id, roleId: role.id } });
    await tx.userRole.createMany({ data: teams.map((teamTypeId) => ({ userId: to.id, roleId: role.id, teamTypeId })), skipDuplicates: true });
    if (isSuperRole) await tx.user.update({ where: { id: from.id }, data: { sessionsValidFrom: new Date() } }); // akun asal langsung keluar dari semua sesi
    if (ebmAdmin) await grantEbmAdmin(tx, actor.tenantId, to.personId!, actor.userId);
    if (b.role === "PENJADWAL" && to.personId) await syncTkiGroup(tx, actor.tenantId, { only: [to.personId], rejoin: true, userId: actor.userId });
  });
  forgetLiveUser(from.id);
  forgetLiveUser(to.id);
  return { role: b.role, from: { id: from.id, email: from.email }, to: { id: to.id, email: to.email } };
}

export const limitsBody = z.object({ limits: z.record(z.string(), z.number().int().min(1).max(SEAT_MAX).nullable()) });

/** Atur jumlah kursi (batas akun aktif) per role. Hanya Superadmin utama. Batas Superadmin dikunci; batas tidak boleh di bawah jumlah pemegang saat ini. */
export async function setRoleLimits(actor: AuthUser, b: z.infer<typeof limitsBody>) {
  const me = await prisma.user.findFirst({ where: { id: actor.userId, tenantId: actor.tenantId, deletedAt: null, isActive: true }, select: { isOwner: true } });
  if (!isSuperadmin(actor) || !me?.isOwner) throw forbidden("Hanya Superadmin utama yang boleh mengatur jumlah kursi per role.");
  const codes = Object.keys(b.limits);
  const roles = await prisma.role.findMany({ where: { tenantId: actor.tenantId, code: { in: codes } }, select: { id: true, code: true, maxAccounts: true } });
  const counts: Record<string, number> = {};
  for (const r of roles) counts[r.code] = await prisma.user.count({ where: { tenantId: actor.tenantId, deletedAt: null, isActive: true, roles: { some: { roleId: r.id } } } });
  const err = validateLimits(b.limits, counts);
  if (err) throw badRequest(err);
  const changed = roles.filter((r) => r.maxAccounts !== (b.limits[r.code] ?? null)).map((r) => ({ id: r.id, code: r.code, from: r.maxAccounts, to: b.limits[r.code] ?? null }));
  await prisma.$transaction(changed.map((c) => prisma.role.update({ where: { id: c.id }, data: { maxAccounts: c.to } })));
  for (const c of changed) await audit({ tenantId: actor.tenantId, userId: actor.userId, action: "user.role.limit", entity: "Role", entityId: c.id, payload: { role: c.code, from: c.from, to: c.to } });
  return { changed: changed.map((c) => ({ code: c.code, from: c.from, to: c.to })) };
}
