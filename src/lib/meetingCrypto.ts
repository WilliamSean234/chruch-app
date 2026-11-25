import { decryptText, encryptText, isEncrypted } from "./fieldCrypto";

/**
 * Isi rapat yang tersimpan terenkripsi di database (kunci MINUTES_ENC_KEY, lihat fieldCrypto.ts): judul atau topik rapat,
 * alasan pembatalan, tautan (judul dan alamat), nama tamu, dan catatan kehadiran. Notulen ada di meetingMinutes.ts.
 * Setiap nilai terikat ke rapatnya (eventId) dan jenis isiannya. Nilai lama tanpa awalan "enc:v1:" tetap terbaca apa adanya.
 */
const sc = (eventId: string) => `meeting:${eventId}`;

export const sealTitle = (eventId: string, v: string) => encryptText(v, sc(eventId), "title");
export const openTitle = (eventId: string, v: string) => decryptText(v, sc(eventId), "title");

export const sealReason = (eventId: string, v: string | null | undefined) => (v ? encryptText(v, sc(eventId), "cancelReason") : null);
export const openReason = (eventId: string, v: string | null) => (v ? decryptText(v, sc(eventId), "cancelReason") : v);

export const sealLink = (eventId: string, l: { title: string; url: string }) => ({ title: encryptText(l.title, sc(eventId), "link.title"), url: encryptText(l.url, sc(eventId), "link.url") });
export const openLink = <T extends { title: string; url: string }>(eventId: string, l: T): T => ({ ...l, title: decryptText(l.title, sc(eventId), "link.title"), url: decryptText(l.url, sc(eventId), "link.url") });

export const sealGuest = (eventId: string, v: string) => encryptText(v, sc(eventId), "guestName");
export const openGuest = (eventId: string, v: string | null) => (v ? decryptText(v, sc(eventId), "guestName") : v);

export const sealNote = (eventId: string, v: string | null | undefined) => (v ? encryptText(v, sc(eventId), "note") : null);
export const openNote = (eventId: string, v: string | null) => (v ? decryptText(v, sc(eventId), "note") : v);

/** Pengganti isi yang gagal dibuka di daftar dan kalender (kunci salah atau data rusak), supaya satu rapat bermasalah tidak merusak seluruh halaman. */
export const UNREADABLE = "🔒 isi tidak bisa dibuka";
const safe = (f: () => string): string => { try { return f(); } catch { return UNREADABLE; } };

/** Seperti openTitle tetapi tidak melempar galat: untuk daftar, kalender, dan label bentrok ruangan. */
export const openTitleSafe = (eventId: string, v: string) => (isEncrypted(v) ? safe(() => openTitle(eventId, v)) : v);

/**
 * Baris rapat dari database → bentuk terbaca (judul, alasan batal, tautan). Dipakai di semua tempat yang membaca rapat.
 * `lenient`: isi yang gagal dibuka diganti UNREADABLE (untuk daftar); tanpa itu galatnya dilempar (halaman rapat, ubah, notulen).
 */
export function openMeetingRow<T extends { id: string; title: string; cancelReason: string | null; links?: { title: string; url: string }[] }>(e: T, lenient = false): T {
  const w = lenient ? safe : (f: () => string) => f();
  return {
    ...e,
    title: w(() => openTitle(e.id, e.title)),
    cancelReason: e.cancelReason ? w(() => openReason(e.id, e.cancelReason) as string) : e.cancelReason,
    ...(e.links ? { links: e.links.map((l) => ({ ...l, title: w(() => openLink(e.id, l).title), url: w(() => openLink(e.id, l).url) })) } : {}),
  };
}
