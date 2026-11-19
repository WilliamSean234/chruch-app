import { prisma } from "./prisma";
import { afterFailure, keysFor, lockedMs, minutesLeft, POLICIES, type Row } from "./throttle";

/** Dilempar saat login ditolak karena terlalu banyak percobaan salah. */
export class LoginLocked extends Error {
  readonly minutes: number;
  constructor(public retryAfterMs: number) {
    super(`Terlalu banyak percobaan masuk. Coba lagi dalam ${minutesLeft(retryAfterMs)} menit.`);
    this.minutes = minutesLeft(retryAfterMs);
  }
}

// Bila tabel pembatas bermasalah (mis. migrasi belum dijalankan), login tetap berjalan tetapi kesalahannya dicatat keras.
const failOpen = (what: string, e: unknown) => console.error(`[login-throttle] ${what} gagal, pembatasan login TIDAK aktif:`, e);

/** Tolak (LoginLocked) bila salah satu kunci sedang terkunci. Dipanggil sebelum memeriksa kata sandi. */
export async function assertNotLocked(email: string, ip: string, now = new Date()): Promise<void> {
  let rows: { key: string; lockedUntil: Date | null }[];
  try {
    rows = await prisma.loginThrottle.findMany({ where: { key: { in: keysFor(email, ip).map((k) => k.key) } }, select: { key: true, lockedUntil: true } });
  } catch (e) { failOpen("pemeriksaan", e); return; }
  const wait = Math.max(0, ...rows.map((r) => lockedMs(r, now)));
  if (wait > 0) throw new LoginLocked(wait);
}

export async function recordFailure(email: string, ip: string, now = new Date()): Promise<void> {
  try {
    const keys = keysFor(email, ip);
    const rows = await prisma.loginThrottle.findMany({ where: { key: { in: keys.map((k) => k.key) } } });
    const byKey = new Map<string, Row>(rows.map((r) => [r.key, r]));
    await prisma.$transaction(keys.map(({ key, scope }) => {
      const next = afterFailure(byKey.get(key) ?? null, POLICIES[scope], now);
      return prisma.loginThrottle.upsert({ where: { key }, create: { key, ...next }, update: next });
    }));
    if (Math.random() < 0.02) await prisma.loginThrottle.deleteMany({ where: { updatedAt: { lt: new Date(now.getTime() - 24 * 3_600_000) } } });
  } catch (e) { failOpen("pencatatan", e); }
}

/** Login berhasil: hitungan salah untuk pasangan alamat dan email ini dikosongkan. */
export async function clearFailures(email: string, ip: string): Promise<void> {
  try {
    await prisma.loginThrottle.deleteMany({ where: { key: keysFor(email, ip)[0]!.key } });
  } catch (e) { failOpen("pembersihan", e); }
}
