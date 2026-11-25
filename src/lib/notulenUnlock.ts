/**
 * Bagian murni kunci notulen: bukti "sudah memasukkan kata sandi ulang" yang bertanda tangan dan berumur pendek (tanpa database).
 *
 * Bukti berbentuk `<kedaluwarsa>.<tanda tangan>`. Tanda tangan (HMAC-SHA256) mengikat akun dan waktu sesi, jadi bukti tidak bisa
 * dipakai akun lain, dan mati bila sesi dicabut (ganti kata sandi, keluar lalu masuk lagi). Masa berlakunya tetap, tidak diperpanjang.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const UNLOCK_COOKIE = "notulen_unlock";
export const UNLOCK_HEADER = "x-notulen-unlock"; // untuk klien yang memakai token Bearer (tanpa cookie)
export const UNLOCK_TTL_MS = 60 * 60_000;
/** Toleransi waktu: bukti yang kedaluwarsanya lebih jauh dari TTL + ini dianggap palsu. */
const SKEW_MS = 60_000;

const mac = (secret: string, userId: string, authAt: number | undefined, exp: number) =>
  createHmac("sha256", secret).update(`notulen|${userId}|${authAt ?? 0}|${exp}`).digest("base64url");

/** Buat bukti yang berlaku `ttl` ms sejak `now`. */
export function signUnlock(secret: string, userId: string, authAt: number | undefined, now: number, ttl = UNLOCK_TTL_MS): string {
  const exp = now + ttl;
  return `${exp}.${mac(secret, userId, authAt, exp)}`;
}

export type UnlockCheck = { ok: true; expiresAt: number } | { ok: false };

/** Periksa bukti: tanda tangan cocok untuk akun dan sesi ini, belum kedaluwarsa, dan kedaluwarsanya masuk akal. */
export function readUnlock(secret: string, token: string | null | undefined, userId: string, authAt: number | undefined, now: number): UnlockCheck {
  if (!token) return { ok: false };
  const i = token.indexOf(".");
  if (i < 1) return { ok: false };
  const expText = token.slice(0, i);
  if (!/^\d{10,16}$/.test(expText)) return { ok: false };
  const exp = Number(expText);
  if (exp <= now || exp > now + UNLOCK_TTL_MS + SKEW_MS) return { ok: false };
  const given = Buffer.from(token.slice(i + 1));
  const want = Buffer.from(mac(secret, userId, authAt, exp));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return { ok: false };
  return { ok: true, expiresAt: exp };
}

/** Ambil satu nilai dari header Cookie; null bila tidak ada. */
export function cookieValue(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      const v = part.slice(eq + 1).trim();
      try { return decodeURIComponent(v); } catch { return v; }
    }
  }
  return null;
}
