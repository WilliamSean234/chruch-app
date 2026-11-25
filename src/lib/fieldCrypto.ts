import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ApiError } from "./errors";

/**
 * Enkripsi isi notulen di level aplikasi (AES-256-GCM), supaya isinya tidak terbaca di tabel database (Neon, SQL editor,
 * cadangan, atau kebocoran database): yang tersimpan hanya teks acak.
 * Kuncinya ada di variabel lingkungan MINUTES_ENC_KEY (32 byte, base64), terpisah dari database.
 * Tiap nilai diikat ke rapat dan nama kolomnya (AAD), jadi isi tidak bisa dipindah antar rapat atau kolom tanpa terdeteksi.
 * Teks kosong tidak dienkripsi (tidak ada yang dilindungi). Nilai lama tanpa awalan tetap terbaca sampai dienkripsi lewat db:encrypt-minutes.
 */
const PREFIX = "enc:v1:";

export const isEncrypted = (s: string) => s.startsWith(PREFIX);

function key(): Buffer {
  const raw = process.env.MINUTES_ENC_KEY;
  if (!raw) throw new ApiError(500, "ENC_KEY_MISSING", "Penyimpanan notulen belum disiapkan: kunci enkripsi belum diisi di server. Hubungi Superadmin.");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new ApiError(500, "ENC_KEY_INVALID", "Kunci enkripsi notulen tidak valid (harus 32 byte base64). Hubungi Superadmin.");
  return k;
}

const aad = (scope: string, field: string) => Buffer.from(`${scope}|${field}`, "utf8");

export function encryptText(plain: string, scope: string, field: string): string {
  if (plain === "") return "";
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  c.setAAD(aad(scope, field));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return PREFIX + Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

export function decryptText(stored: string, scope: string, field: string): string {
  if (!isEncrypted(stored)) return stored; // nilai lama (belum dienkripsi)
  const buf = Buffer.from(stored.slice(PREFIX.length), "base64");
  const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  d.setAAD(aad(scope, field));
  d.setAuthTag(buf.subarray(12, 28));
  try {
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    throw new ApiError(500, "ENC_DECRYPT_FAILED", "Isi notulen tidak bisa dibuka: kunci enkripsi berbeda dari yang dipakai saat menyimpan, atau datanya rusak.");
  }
}

/** Pastikan nilai tersimpan terenkripsi (nilai lama yang masih teks biasa ikut dienkripsi). */
export const ensureEncrypted = (stored: string, scope: string, field: string) => (isEncrypted(stored) ? stored : encryptText(stored, scope, field));
