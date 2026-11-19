/**
 * Aturan pembatasan percobaan login (murni, tanpa database, supaya mudah diuji).
 * Tiga kunci dihitung bersamaan:
 *  - ipemail: satu alamat + satu email. 5 salah = terkunci. Orang lain di alamat berbeda tidak ikut terkunci,
 *    jadi penyerang tidak bisa mengunci akun Superadmin dari tempat lain hanya dengan menebak sandinya.
 *  - email: dari alamat mana pun. 20 salah = terkunci (serangan dari banyak alamat).
 *  - ip: satu alamat ke email mana pun. 30 salah = terkunci (menebak banyak akun).
 */
export type Row = { failures: number; windowStart: Date; lockedUntil: Date | null };
export type Policy = { max: number; windowMs: number; lockMs: number };

const MIN = 60_000;
export const POLICIES = {
  ipemail: { max: 5, windowMs: 15 * MIN, lockMs: 15 * MIN },
  email: { max: 20, windowMs: 15 * MIN, lockMs: 15 * MIN },
  ip: { max: 30, windowMs: 15 * MIN, lockMs: 15 * MIN },
} as const satisfies Record<string, Policy>;

export type Scope = keyof typeof POLICIES;

export function keysFor(email: string, ip: string): { key: string; scope: Scope }[] {
  const e = email.trim().toLowerCase();
  return [
    { key: `ipemail:${ip}|${e}`, scope: "ipemail" },
    { key: `email:${e}`, scope: "email" },
    { key: `ip:${ip}`, scope: "ip" },
  ];
}

/** Sisa waktu kunci dalam milidetik; 0 bila tidak terkunci. */
export function lockedMs(row: Pick<Row, "lockedUntil"> | null | undefined, now: Date): number {
  const until = row?.lockedUntil?.getTime();
  return until && until > now.getTime() ? until - now.getTime() : 0;
}

/** Keadaan baru setelah satu percobaan gagal. Jendela habis = hitungan mulai dari awal. */
export function afterFailure(row: Row | null, p: Policy, now: Date): Row {
  if (!row || now.getTime() - row.windowStart.getTime() >= p.windowMs) return { failures: 1, windowStart: now, lockedUntil: p.max <= 1 ? new Date(now.getTime() + p.lockMs) : null };
  const failures = row.failures + 1;
  const lockedUntil = failures >= p.max ? new Date(now.getTime() + p.lockMs) : row.lockedUntil;
  return { failures, windowStart: row.windowStart, lockedUntil };
}

export const minutesLeft = (ms: number) => Math.max(1, Math.ceil(ms / MIN));

/** Alamat klien dari header proxy (Vercel mengisi x-forwarded-for dengan alamat pengunjung). */
export function clientIp(h: { get(name: string): string | null }): string {
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || h.get("x-real-ip")?.trim() || "unknown";
}
