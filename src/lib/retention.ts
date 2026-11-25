/** Berapa lama data sementara disimpan sebelum dibersihkan. Murni (tanpa database) supaya mudah diuji. */
export const RETENTION_DAYS = {
  idempotencyKey: 7, // kunci anti-klik-ganda; hanya berguna beberapa detik
  emailToken: 30, // tautan verifikasi yang sudah terpakai atau kedaluwarsa
  registrationRejected: 90, // pendaftaran yang ditolak (menyimpan email pendaftar)
  registrationUnverified: 30, // pendaftaran yang emailnya tidak pernah diverifikasi (tidak bisa disetujui)
  swapDecided: 180, // permintaan pengganti yang sudah diputuskan atau kedaluwarsa
  bookingReleased: 30, // jadwal orang/ruangan yang sudah dilepas (batal atau ganti orang)
} as const;

export const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);
