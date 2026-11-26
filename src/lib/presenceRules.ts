/** Aturan status online (murni, tanpa database, supaya bisa diuji). */

/** Tab yang terlihat dan dipakai mengirim tanda tiap PRESENCE_BEAT_MS; dianggap online sampai PRESENCE_TTL_MS sejak tanda terakhir. */
export const PRESENCE_BEAT_MS = 15_000;
export const PRESENCE_TTL_MS = 40_000; // dua tanda terlewat + sedikit toleransi; tab yang ditutup biasa langsung offline lewat sinyal "off"
/** Tanpa gerakan (ketuk, ketik, gulir) selama ini, tab berhenti mengirim tanda: pemiliknya dianggap pergi. */
export const PRESENCE_IDLE_MS = 5 * 60_000;
/** Berapa tab/perangkat sekaligus yang dicatat per akun; sisanya (yang paling lama) dibuang. */
export const PRESENCE_MAX_CLIENTS = 8;

export const presenceCutoff = (now = new Date()) => new Date(now.getTime() - PRESENCE_TTL_MS);
export const isFresh = (seenAt: Date, now = new Date()) => seenAt.getTime() > presenceCutoff(now).getTime();
export const validClientId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(s);
