-- Siapa yang melihat rapat di kalender dan daftar: MEMBERS = anggota kelompok (dan Penjadwal/Superadmin), ALL = semua orang yang masuk.
-- Rapat yang sudah ada tetap ALL (aturan lama: waktu, ruangan, dan nama kelompok terlihat), jadi tidak ada yang berubah.
ALTER TABLE "Event" ADD COLUMN "calendarAudience" TEXT NOT NULL DEFAULT 'ALL';
