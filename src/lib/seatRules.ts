/**
 * Aturan merangkap tugas dalam satu acara. Murni (tanpa database) supaya mudah diuji.
 *
 * - PIC boleh merangkap Usher (dan sebaliknya), tetap diberi catatan.
 * - Sesama posisi EBM boleh dirangkap oleh satu orang di acara yang sama, tetap diberi catatan.
 * - Orang yang bertugas di EBM tidak boleh merangkap Usher atau tim pemusik (dan sebaliknya).
 * - Anggota EBM yang bertugas di luar EBM (pemusik, pimpinan ibadah, usher) sebaiknya hanya satu orang per acara (peringatan).
 *
 * Jenis tim dikenali dari namanya (tim paten dari seed: "Penatalayan ibadah", "Tim EBM", "Usher"; nama lama "Pimpinan ibadah" dan
 * "Tim pemusik" tetap dikenali). Penatalayan ibadah berisi pimpinan (PIC, Liturgos, Pembicara) sekaligus pemusik (alat musik, Singer),
 * jadi jenis kursinya ditentukan dari tim dan posisinya (`seatKind`).
 */
export type TeamKind = "EBM" | "USHER" | "PEMUSIK" | "PIMPINAN" | "OTHER";

export const teamKind = (teamName: string): TeamKind => {
  const n = teamName.toLowerCase();
  if (/\bebm\b/.test(n)) return "EBM";
  if (/\busher\b/.test(n)) return "USHER";
  if (/pemusik|musik/.test(n)) return "PEMUSIK";
  if (/pimpinan|penatalayan/.test(n)) return "PIMPINAN";
  return "OTHER";
};

/** Posisi pimpinan ibadah; posisi lain di Penatalayan ibadah (alat musik, Singer) dihitung sebagai pemusik. */
const isLeaderMinistry = (ministryName: string) => /^(pic|liturgos|wl|pembicara)\b/i.test(ministryName.trim());

/** Jenis kursi: seperti jenis tim, kecuali kursi non-pimpinan di Penatalayan ibadah yang dihitung pemusik. */
export const seatKind = (teamName: string, ministryName: string): TeamKind => {
  const k = teamKind(teamName);
  return k === "PIMPINAN" && !isLeaderMinistry(ministryName) ? "PEMUSIK" : k;
};

export const isPic = (ministryName: string) => /^pic$/i.test(ministryName.trim());

export type SeatRef = { teamName: string; ministryName: string };

export type PairVerdict =
  | { kind: "ALLOWED"; note: string }
  | { kind: "BLOCKED"; message: string }
  | { kind: "CONFLICT" };

/** Menilai dua kursi yang dipegang orang yang sama di acara yang sama. `mine` = kursi yang sedang diisi, `other` = kursi lain miliknya. */
export function judgePair(mine: SeatRef, other: SeatRef, who: string): PairVerdict {
  const km = seatKind(mine.teamName, mine.ministryName);
  const ko = seatKind(other.teamName, other.ministryName);

  if ((isPic(mine.ministryName) && ko === "USHER") || (km === "USHER" && isPic(other.ministryName))) {
    return { kind: "ALLOWED", note: `${who} merangkap PIC dan Usher di acara ini.` };
  }
  // Tim EBM kecil: anggotanya boleh memegang lebih dari satu posisi EBM di acara yang sama (tetap diberi catatan).
  if (km === "EBM" && ko === "EBM") {
    return { kind: "ALLOWED", note: `${who} merangkap ${other.ministryName} dan ${mine.ministryName} di acara ini.` };
  }
  if (ko === "EBM" && (km === "USHER" || km === "PEMUSIK")) {
    return { kind: "BLOCKED", message: `${who} sudah bertugas di EBM (${other.ministryName}) pada acara ini, jadi tidak boleh merangkap ${mine.ministryName}. Orang yang bertugas di EBM tidak boleh merangkap Usher atau tim pemusik.` };
  }
  if (km === "EBM" && (ko === "USHER" || ko === "PEMUSIK")) {
    return { kind: "BLOCKED", message: `${who} sudah bertugas sebagai ${other.ministryName} pada acara ini, jadi tidak boleh merangkap EBM (${mine.ministryName}). Orang yang bertugas di EBM tidak boleh merangkap Usher atau tim pemusik.` };
  }
  return { kind: "CONFLICT" };
}

/** Kursi yang dipegang anggota EBM di luar EBM, untuk menghitung batas satu orang per acara. */
export type OutsideSeat = { personId: string; name: string; ministryName: string; teamName: string };

const OUTSIDE: TeamKind[] = ["PEMUSIK", "PIMPINAN", "USHER"];
export const isOutsideEbmSeat = (teamName: string) => OUTSIDE.includes(teamKind(teamName));

/**
 * Peringatan bila acara ini sudah punya anggota EBM lain yang bertugas di luar EBM.
 * `others` = kursi lain di acara (bukan kursi yang sedang diisi) yang dipegang anggota EBM di tim pemusik, pimpinan ibadah, atau usher.
 */
export function ebmOutsideWarning(a: { personId: string; personIsEbm: boolean; seatTeamName: string; others: OutsideSeat[] }): string | null {
  if (!a.personIsEbm || !isOutsideEbmSeat(a.seatTeamName)) return null;
  const rest = a.others.filter((o) => o.personId !== a.personId && isOutsideEbmSeat(o.teamName));
  if (rest.length === 0) return null;
  const names = [...new Map(rest.map((o) => [o.personId, `${o.name} (${o.ministryName})`])).values()].join(", ");
  return `Anggota EBM yang bertugas di luar EBM pada acara ini sudah ada: ${names}. Sebaiknya hanya 1 anggota EBM yang ditugaskan sebagai pemusik, pimpinan ibadah, atau usher, supaya tim EBM tetap cukup.`;
}

// ───────── Ibadah Minggu 1 / 2 ─────────

/** "Ibadah Minggu I" / "Ibadah Minggu 2" → { base, n }. Selain pola itu: null. */
export function sundayPair(name: string): { base: string; n: 1 | 2 } | null {
  const m = /^(ibadah minggu)\s*[-–]?\s*(ii|i|2|1)$/i.exec(name.trim());
  if (!m) return null;
  const t = m[2]!.toLowerCase();
  return { base: m[1]!.toLowerCase(), n: t === "i" || t === "1" ? 1 : 2 };
}

/** Apakah dua nama template adalah pasangan (Ibadah Minggu 1 dan 2)? */
export function isSundayPair(a: string, b: string): boolean {
  const x = sundayPair(a);
  const y = sundayPair(b);
  return !!x && !!y && x.base === y.base && x.n !== y.n;
}
