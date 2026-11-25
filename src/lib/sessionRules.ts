/**
 * Aturan murni untuk sesi login (tanpa database, supaya mudah diuji).
 * Sesi dicabut bila dibuat sebelum `validFrom` (kata sandi diganti atau direset admin). Sesi lama tanpa cap waktu ikut dicabut
 * begitu `validFrom` terisi.
 */
export function sessionRevoked(authAt: number | undefined, validFrom: Date | null | undefined): boolean {
  if (!validFrom) return false;
  return authAt === undefined || authAt < validFrom.getTime();
}

/** Cache singkat: satu pembacaan database melayani banyak permintaan beruntun dari pengguna yang sama. */
export const LIVE_TTL_MS = 10_000;
export const LIVE_MAX = 500;
