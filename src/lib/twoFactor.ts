import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { ApiError, badRequest, conflict, forbidden, notFound } from "./errors";
import { decryptText, encryptText } from "./fieldCrypto";
import { isSuperadmin, type AuthUser } from "./rbac";
import { forgetLiveUser } from "./liveUser";
import { audit } from "./audit";
import { LIMITS, rateLimit } from "./rateLimit";
import { getChurchProfile } from "./church";
import { groupSecret, hashRecovery, kindOfCode, matchTotp, newRecoveryCodes, newSecret, otpauthUri } from "./totp";

/**
 * Verifikasi 2 langkah untuk akun Superadmin. Masuk butuh kata sandi DAN kode 6 angka dari aplikasi autentikator di HP pemiliknya.
 * Tiap akun punya kunci sendiri (tidak dibagi). Kunci disimpan terenkripsi (kunci server MINUTES_ENC_KEY, terikat ke akunnya),
 * jadi isi tabel database saja tidak cukup untuk membuat kodenya. Kode cadangan sekali pakai disimpan sebagai hash.
 */
const scope = (userId: string) => `totp:${userId}`;
const WRONG_CODE = "Kode salah atau sudah kedaluwarsa. Pastikan jam HP Anda diatur otomatis, lalu masukkan kode yang sedang tampil di aplikasi (kode berganti tiap 30 detik). Kode yang baru saja dipakai tidak bisa dipakai lagi: tunggu kode baru muncul.";

/** Kunci enkripsi bermasalah: beri pesan yang menyebut verifikasi 2 langkah dan jalan keluarnya. */
function wrapEnc<T>(fn: () => T): T {
  try { return fn(); } catch (e) {
    if (e instanceof ApiError && e.code.startsWith("ENC_")) {
      throw new ApiError(500, e.code, "Verifikasi 2 langkah tidak bisa dipakai karena kunci enkripsi server (MINUTES_ENC_KEY) bermasalah atau berbeda dari saat 2 langkah diaktifkan. Superadmin lain bisa mereset 2 langkah akun ini di Pengaturan > Kelola akun, atau jalankan npm run db:reset-2fa dari terminal.");
    }
    throw e;
  }
}

/** Dilempar saat login: kata sandi benar tetapi akun ini memakai 2 langkah dan kodenya belum dikirim. */
export class TwoFactorRequired extends Error {
  constructor() { super("Masukkan kode verifikasi 2 langkah."); }
}
/** Dilempar saat login: kode 2 langkah salah. */
export class TwoFactorInvalid extends Error {
  constructor() { super(WRONG_CODE); }
}

type Factor = { id: string; totpSecret: string | null; recoveryHashes: string[] };

/**
 * Periksa kode kedua: 6 angka dari aplikasi, atau kode cadangan. Kode 6 angka hanya bisa dipakai sekali (langkah waktunya dicatat),
 * kode cadangan dihapus begitu dipakai. Mengembalikan jenis yang cocok, atau null.
 */
export async function checkSecondFactor(user: Factor, input: string, nowMs = Date.now()): Promise<"totp" | "recovery" | null> {
  const kind = kindOfCode(input);
  if (!kind || !user.totpSecret) return null;
  if (kind === "totp") {
    const secret = wrapEnc(() => decryptText(user.totpSecret!, scope(user.id), "secret"));
    const step = matchTotp(secret, input, nowMs);
    if (step === null) return null;
    const r = await prisma.user.updateMany({ where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
    return r.count === 1 ? "totp" : null; // 0 = kode yang sama sudah dipakai
  }
  const h = hashRecovery(input);
  if (!user.recoveryHashes.includes(h)) return null;
  const r = await prisma.user.updateMany({ where: { id: user.id, recoveryHashes: { has: h } }, data: { recoveryHashes: { set: user.recoveryHashes.filter((x) => x !== h) } } });
  return r.count === 1 ? "recovery" : null;
}

export async function twoFactorStatus(u: AuthUser) {
  const row = await prisma.user.findFirst({ where: { id: u.userId, tenantId: u.tenantId, deletedAt: null }, select: { totpEnabledAt: true, recoveryHashes: true } });
  if (!row) throw notFound("Akun");
  return { eligible: isSuperadmin(u), enabled: !!row.totpEnabledAt, enabledAt: row.totpEnabledAt?.toISOString() ?? null, recoveryLeft: row.totpEnabledAt ? row.recoveryHashes.length : 0 };
}

/** Langkah 1: buat kunci baru (belum berlaku sampai kodenya dikonfirmasi). Memulai ulang menimpa kunci yang belum dikonfirmasi. */
export async function beginTwoFactorSetup(u: AuthUser) {
  if (!isSuperadmin(u)) throw forbidden("Verifikasi 2 langkah tersedia untuk akun Superadmin.");
  const me = await prisma.user.findFirst({ where: { id: u.userId, tenantId: u.tenantId, deletedAt: null }, select: { email: true, totpEnabledAt: true } });
  if (!me) throw notFound("Akun");
  if (me.totpEnabledAt) throw conflict("Verifikasi 2 langkah sudah aktif. Untuk memasangnya di HP lain, matikan dulu lalu aktifkan lagi.");
  const secret = newSecret();
  await prisma.user.update({ where: { id: u.userId }, data: { totpSecret: wrapEnc(() => encryptText(secret, scope(u.userId), "secret")), totpLastStep: null, recoveryHashes: [] } });
  const church = await getChurchProfile(u.tenantId).catch(() => null);
  return { secret, secretText: groupSecret(secret), uri: otpauthUri({ secret, account: me.email, issuer: church?.name?.trim() || "Pelayanan" }), account: me.email };
}

/** Langkah 2: cocokkan kode dari aplikasi. Berhasil: 2 langkah aktif dan kode cadangan ditampilkan SEKALI. */
export async function confirmTwoFactorSetup(u: AuthUser, code: string) {
  await rateLimit(`2fa-confirm:${u.userId}`, LIMITS.twoFactor);
  const me = await prisma.user.findFirst({ where: { id: u.userId, tenantId: u.tenantId, deletedAt: null }, select: { totpSecret: true, totpEnabledAt: true } });
  if (!me?.totpSecret || me.totpEnabledAt) throw badRequest("Pengaktifan belum dimulai. Tekan Mulai pengaktifan dulu.");
  const secret = wrapEnc(() => decryptText(me.totpSecret!, scope(u.userId), "secret"));
  const step = matchTotp(secret, code, Date.now());
  if (step === null) throw badRequest(WRONG_CODE);
  const recoveryCodes = newRecoveryCodes(8);
  await prisma.user.update({ where: { id: u.userId }, data: { totpEnabledAt: new Date(), totpLastStep: step, recoveryHashes: recoveryCodes.map(hashRecovery) } });
  forgetLiveUser(u.userId);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "user.2fa.enable", entity: "User", entityId: u.userId });
  return { recoveryCodes };
}

async function requirePasswordAndCode(u: AuthUser, password: string | null, code: string) {
  const me = await prisma.user.findFirst({ where: { id: u.userId, tenantId: u.tenantId, deletedAt: null, isActive: true }, select: { id: true, passwordHash: true, totpSecret: true, totpEnabledAt: true, recoveryHashes: true } });
  if (!me?.totpEnabledAt) throw conflict("Verifikasi 2 langkah belum aktif.");
  if (password !== null && !(await bcrypt.compare(password, me.passwordHash))) throw badRequest("Kata sandi salah.");
  if (!(await checkSecondFactor(me, code))) throw badRequest(WRONG_CODE);
}

/** Matikan 2 langkah akun sendiri: perlu kata sandi dan satu kode (dari aplikasi, atau kode cadangan bila HP hilang). */
export async function disableTwoFactor(u: AuthUser, b: { password: string; code: string }) {
  await rateLimit(`2fa-change:${u.userId}`, LIMITS.twoFactor);
  await requirePasswordAndCode(u, b.password, b.code);
  await prisma.user.update({ where: { id: u.userId }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryHashes: [] } });
  forgetLiveUser(u.userId);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "user.2fa.disable", entity: "User", entityId: u.userId });
}

/** Buat kode cadangan baru (yang lama hangus). Perlu satu kode yang sedang berlaku. */
export async function regenerateRecoveryCodes(u: AuthUser, b: { code: string }) {
  await rateLimit(`2fa-change:${u.userId}`, LIMITS.twoFactor);
  await requirePasswordAndCode(u, null, b.code);
  const recoveryCodes = newRecoveryCodes(8);
  await prisma.user.update({ where: { id: u.userId }, data: { recoveryHashes: recoveryCodes.map(hashRecovery) } });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "user.2fa.recovery", entity: "User", entityId: u.userId });
  return { recoveryCodes };
}

/**
 * Superadmin lain mereset 2 langkah sebuah akun (HP hilang dan kode cadangan habis). Sesi akun itu dicabut dan pemiliknya masuk lagi
 * dengan kata sandi saja, lalu bisa mengaktifkannya kembali. Tercatat di Log aktivitas. Akun sendiri tidak bisa direset lewat sini.
 */
export async function resetTwoFactor(actor: AuthUser, targetUserId: string) {
  if (!isSuperadmin(actor)) throw forbidden("Hanya Superadmin yang boleh mereset verifikasi 2 langkah.");
  if (targetUserId === actor.userId) throw badRequest("Untuk akun Anda sendiri, pakai Matikan di halaman Keamanan akun.");
  const t = await prisma.user.findFirst({ where: { id: targetUserId, tenantId: actor.tenantId, deletedAt: null }, select: { id: true, totpEnabledAt: true, totpSecret: true } });
  if (!t) throw notFound("Akun");
  if (!t.totpEnabledAt && !t.totpSecret) throw conflict("Akun ini tidak memakai verifikasi 2 langkah.");
  await prisma.user.update({ where: { id: t.id }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryHashes: [], sessionsValidFrom: new Date() } });
  forgetLiveUser(t.id);
  await audit({ tenantId: actor.tenantId, userId: actor.userId, action: "user.2fa.reset", entity: "User", entityId: t.id });
}
