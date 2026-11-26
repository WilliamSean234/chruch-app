import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Verifikasi 2 langkah (TOTP, RFC 6238) tanpa paket tambahan: kode 6 angka yang berganti tiap 30 detik di aplikasi autentikator
 * (Google Authenticator, Microsoft Authenticator, Authy, dll). Semua fungsi di sini murni supaya mudah diuji.
 */
export const STEP_SECONDS = 30;
export const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

/** Spasi, strip, huruf kecil, dan "=" di akhir diabaikan; karakter lain membuat hasilnya null. */
export function base32Decode(s: string): Buffer | null {
  const clean = s.toUpperCase().replace(/[\s-]+/g, "").replace(/=+$/, "");
  if (!clean) return null;
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) return null;
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** Kunci rahasia baru: 20 byte acak (160 bit), ditulis base32 (32 karakter). */
export const newSecret = () => base32Encode(randomBytes(20));

export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const o = h[h.length - 1]! & 15;
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const stepOf = (nowMs: number) => Math.floor(nowMs / 1000 / STEP_SECONDS);

/** Kode yang berlaku pada waktu tertentu (untuk pengujian dan layar petunjuk). */
export function totpCode(secretB32: string, nowMs: number, offset = 0): string | null {
  const s = base32Decode(secretB32);
  return s ? hotp(s, stepOf(nowMs) + offset) : null;
}

const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Cocokkan kode 6 angka. Toleransi satu langkah (30 detik) ke belakang dan ke depan untuk jam HP yang sedikit meleset.
 * Mengembalikan nomor langkah yang cocok (untuk mencegah kode yang sama dipakai dua kali), atau null.
 */
export function matchTotp(secretB32: string, code: string, nowMs: number, window = 1): number | null {
  const secret = base32Decode(secretB32);
  const c = code.replace(/\s+/g, "");
  if (!secret || !/^\d{6}$/.test(c)) return null;
  const now = stepOf(nowMs);
  let hit: number | null = null;
  for (let d = -window; d <= window; d++) if (sameText(hotp(secret, now + d), c) && hit === null) hit = now + d; // semua langkah diperiksa: waktu tetap
  return hit;
}

/** Tautan otpauth:// yang dibaca aplikasi autentikator (lewat QR atau dibuka langsung di HP). */
export function otpauthUri(o: { secret: string; account: string; issuer: string }): string {
  const issuer = encodeURIComponent(o.issuer);
  return `otpauth://totp/${issuer}:${encodeURIComponent(o.account)}?secret=${o.secret}&issuer=${issuer}`;
}

/** Kunci untuk diketik manual: kelompok 4 karakter. */
export const groupSecret = (s: string) => s.replace(/(.{4})/g, "$1 ").trim();

// ───────── Kode cadangan: dipakai sekali bila HP hilang ─────────
const RECOVERY_LEN = 10;

/** Contoh: "K7QX2-M4RTA". Huruf dan angka yang mudah dibaca (tanpa 0, 1, 8, 9 yang mirip huruf lain). */
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ234567";
export function newRecoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () => {
    let s = "";
    for (let i = 0; i < RECOVERY_LEN; i++) s += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** Huruf besar, tanpa spasi atau strip. */
export const normalizeRecovery = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const looksLikeRecovery = (s: string) => normalizeRecovery(s).length === RECOVERY_LEN;
export const hashRecovery = (code: string) => createHash("sha256").update(`recovery:${normalizeRecovery(code)}`).digest("hex");

/** Kode 6 angka (TOTP) atau kode cadangan? Selain itu: tidak dikenali. */
export function kindOfCode(input: string): "totp" | "recovery" | null {
  const t = input.trim();
  if (/^\d{3}\s?\d{3}$/.test(t)) return "totp";
  if (looksLikeRecovery(t)) return "recovery";
  return null;
}
