-- Mode rapat: "hanya jadwal" (agenda atau pinjam ruangan) atau "rapat lengkap" (peserta, kehadiran, notulen, lampiran).
-- Rapat yang sudah ada tetap lengkap, jadi tidak ada yang berubah bagi pengguna sekarang.
ALTER TABLE "Event" ADD COLUMN "fullMeeting" BOOLEAN NOT NULL DEFAULT true;
