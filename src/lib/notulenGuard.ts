import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { ApiError, badRequest } from "./errors";
import type { AuthUser } from "./rbac";
import { sessionAuthAt } from "./session";
import { LIMITS } from "./rateLimit";
import { afterFailure, lockedMs, minutesLeft } from "./throttle";
import { cookieValue, readUnlock, signUnlock, UNLOCK_COOKIE, UNLOCK_HEADER, UNLOCK_TTL_MS } from "./notulenUnlock";

/**
 * Kunci notulen: isi notulen (baca, tulis, finalkan, revisi, cetak) baru terbuka setelah pemilik akun memasukkan kata sandinya lagi.
 * Tujuannya melindungi dari HP atau komputer yang dipinjam atau tertinggal terbuka. Bukti berlaku 60 menit dan disimpan di cookie
 * (klien dengan token Bearer memakai header). Yang menentukan siapa boleh melihat notulen tetap keanggotaan kelompok, bukan kunci ini.
 */

const secret = (): string => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET belum diisi");
  return s;
};

export const LOCKED_CODE = "NOTULEN_LOCKED";

/** Kapan bukti berakhir (ms), atau null bila notulen masih terkunci. Dengan `req`: dari request API; tanpa: dari cookie halaman. */
export async function unlockExpiry(u: AuthUser, req?: Request): Promise<number | null> {
  const token = req
    ? req.headers.get(UNLOCK_HEADER) ?? cookieValue(req.headers.get("cookie"), UNLOCK_COOKIE)
    : (await cookies()).get(UNLOCK_COOKIE)?.value ?? null;
  const r = readUnlock(secret(), token, u.userId, await sessionAuthAt(req), Date.now());
  return r.ok ? r.expiresAt : null;
}

/** Tolak (403 NOTULEN_LOCKED) bila notulen belum dibuka dengan kata sandi. Dipanggil di semua rute yang menyentuh isi notulen. */
export async function requireUnlocked(u: AuthUser, req: Request): Promise<void> {
  if ((await unlockExpiry(u, req)) === null) throw new ApiError(403, LOCKED_CODE, "Masukkan kata sandi Anda untuk membuka notulen.");
}

const failKey = (userId: string) => `notulen-unlock:${userId}`;
const failOpen = (what: string, e: unknown) => console.error(`[notulen-unlock] ${what} gagal, pembatasan TIDAK aktif:`, e);

/**
 * Periksa kata sandi pemilik akun. Yang salah dihitung: 5 kali salah dalam 15 menit mengunci percobaan selama 15 menit.
 * Berhasil: hitungan salah dikosongkan dan bukti baru dikembalikan beserta waktu berakhirnya.
 */
export async function unlockWithPassword(u: AuthUser, password: string, req: Request): Promise<{ token: string; expiresAt: number }> {
  const now = new Date();
  const key = failKey(u.userId);
  let row = null;
  try { row = await prisma.loginThrottle.findUnique({ where: { key } }); } catch (e) { failOpen("pemeriksaan", e); }
  const wait = lockedMs(row, now);
  if (wait > 0) throw new ApiError(429, "TOO_MANY", `Terlalu banyak kata sandi salah. Coba lagi sekitar ${minutesLeft(wait)} menit lagi.`);

  const user = await prisma.user.findFirst({ where: { id: u.userId, tenantId: u.tenantId, deletedAt: null, isActive: true }, select: { passwordHash: true } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    try {
      const next = afterFailure(row, LIMITS.unlockFail, now);
      await prisma.loginThrottle.upsert({ where: { key }, create: { key, ...next }, update: next });
    } catch (e) { failOpen("pencatatan", e); }
    throw badRequest("Kata sandi salah.");
  }
  try { await prisma.loginThrottle.deleteMany({ where: { key } }); } catch (e) { failOpen("pembersihan", e); }
  const token = signUnlock(secret(), u.userId, await sessionAuthAt(req), now.getTime());
  return { token, expiresAt: now.getTime() + UNLOCK_TTL_MS };
}
