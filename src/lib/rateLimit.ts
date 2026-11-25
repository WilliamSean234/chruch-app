import { prisma } from "./prisma";
import { ApiError } from "./errors";
import { afterFailure, lockedMs, minutesLeft, type Policy } from "./throttle";

const MIN = 60_000;

/** Batas untuk aksi yang bisa disalahgunakan tetapi bukan login. Hitungannya memakai tabel pembatas login (kunci berawalan nama aksi). */
export const LIMITS = {
  resend: { max: 10, windowMs: 15 * MIN, lockMs: 15 * MIN }, // kirim ulang verifikasi email, per alamat
  backup: { max: 6, windowMs: 60 * MIN, lockMs: 30 * MIN }, // unduh cadangan, per akun
  loadReport: { max: 30, windowMs: 60 * MIN, lockMs: 15 * MIN }, // unduh statistik beban pelayan, per akun
  swapRequest: { max: 10, windowMs: 60 * MIN, lockMs: 60 * MIN }, // minta pengganti, per akun
  pushTest: { max: 5, windowMs: 5 * MIN, lockMs: 5 * MIN }, // tombol tes notifikasi, per akun
} as const satisfies Record<string, Policy>;

/**
 * Catat satu pemakaian `key`; lempar 429 bila batasnya sudah terlewati. Bila tabel pembatas bermasalah, aksi tetap jalan (galat dicatat),
 * sama seperti pembatas login.
 */
export async function rateLimit(key: string, p: Policy, now = new Date()): Promise<void> {
  try {
    const row = await prisma.loginThrottle.findUnique({ where: { key } });
    const wait = lockedMs(row, now);
    if (wait > 0) throw new ApiError(429, "TOO_MANY", `Terlalu banyak permintaan. Coba lagi sekitar ${minutesLeft(wait)} menit lagi.`);
    const next = afterFailure(row, p, now);
    await prisma.loginThrottle.upsert({ where: { key }, create: { key, ...next }, update: next });
    if (Math.random() < 0.02) await prisma.loginThrottle.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - 24 * 3_600_000) } } });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    console.error(`[rate-limit] ${key} gagal, pembatasan TIDAK aktif:`, e);
  }
}
