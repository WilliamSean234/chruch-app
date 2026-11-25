/**
 * Aturan "minta pengganti" yang murni (tanpa database), supaya mudah diuji.
 * Pelayan hanya meminta; yang mengganti orangnya tetap Penjadwal atau Admin Tim tim itu lewat pengisian kursi biasa.
 */

export const SWAP_STATUS = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"] as const;
export type SwapStatus = (typeof SWAP_STATUS)[number];

/** Berapa lama pelayan masih melihat catatan "ditolak" di jadwalnya. */
export const REJECTED_VISIBLE_DAYS = 7;

type SeatState = { eventStatus: string; eventKind: string; endsAt: Date; seatPersonId: string | null; requesterPersonId: string | null };

/** Pesan bila permintaan tidak boleh dibuat, atau null bila boleh. */
export function swapBlock(s: SeatState, now: Date): string | null {
  if (!s.requesterPersonId || s.seatPersonId !== s.requesterPersonId) return "Posisi ini bukan milik Anda.";
  if (s.eventKind !== "IBADAH") return "Permintaan pengganti hanya untuk acara ibadah.";
  if (s.eventStatus === "CANCELLED") return "Acara ini sudah dibatalkan.";
  if (s.eventStatus !== "PUBLISHED") return "Jadwal ini belum diterbitkan.";
  if (s.endsAt.getTime() <= now.getTime()) return "Acara ini sudah selesai.";
  return null;
}

/**
 * Permintaan terbuka yang sudah tidak berlaku: kursinya sudah dipegang orang lain atau dikosongkan,
 * atau acaranya sudah dibatalkan, dihapus, atau selesai. Tidak perlu diputuskan lagi.
 */
export function swapStale(r: { requesterPersonId: string }, seat: { personId: string | null } | null, ev: { status: string; endsAt: Date; deleted: boolean } | null, now: Date): boolean {
  if (!seat || !ev) return true;
  return seat.personId !== r.requesterPersonId || ev.deleted || ev.status !== "PUBLISHED" || ev.endsAt.getTime() <= now.getTime();
}

/** Nama dibersihkan: spasi ganda dan karakter kontrol dibuang, kosong menjadi null. */
export function cleanLine(v: string | null | undefined, max: number): string | null {
  const t = (v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return t || null;
}

/** Catatan penolakan yang masih perlu ditampilkan kepada pelayan. */
export function showRejected(decidedAt: Date | null, now: Date): boolean {
  return !!decidedAt && now.getTime() - decidedAt.getTime() <= REJECTED_VISIBLE_DAYS * 86_400_000;
}
