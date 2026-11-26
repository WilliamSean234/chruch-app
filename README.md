# Pelayanan — Penjadwalan Gereja

Aplikasi penjadwalan pelayanan gereja (fase 1). Fondasi sama dengan Splitbill dan po-system:
Next.js, TypeScript, PostgreSQL di Neon lewat Prisma, NextAuth v5, Zod, Tailwind.

Dokumen desain, schema, dan roadmap (W1T1 dst.) ada di dokumen "Desain Arsitektur Aplikasi Gereja" di Claude.

## Menjalankan pertama kali

1. Pasang paket:

   ```
   npm install
   ```

2. Salin `.env.example` menjadi `.env`, lalu isi `DATABASE_URL`, `DIRECT_URL` (Neon), `AUTH_SECRET`,
   serta `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD`.

3. Buat tabel:

   ```
   npx prisma migrate dev --name init
   ```

4. Pasang constraint anti-bentrok (sekali saja):

   ```
   npx prisma migrate dev --create-only --name booking_no_overlap
   ```

   Buka file `migration.sql` yang baru dibuat di `prisma/migrations/`, tempel isi
   `prisma/sql/booking_no_overlap.sql` ke dalamnya, simpan, lalu:

   ```
   npx prisma migrate dev
   ```

5. Isi data awal (tim paten, posisi, ruangan, tiga template, role, akun Superadmin):

   ```
   npm run db:seed
   # opsional, HANYA untuk database percobaan: orang dan akun dummy per role
   npm run db:seed:dummy
   ```

6. Jalankan:

   ```
   npm run dev
   ```

## Akun dan kata sandi

- Superadmin membuat akun lewat **Orang & pelayanan → pilih orang → Ubah data lengkap → Akun login** (email, kata sandi awal, role). Email akun bisa diubah kemudian lewat **Ubah email** (di sana atau di Pengaturan → Kelola akun); email baru ditandai belum terverifikasi dan tidak boleh dipakai akun lain.
- Akun baru (dan akun yang kata sandinya direset admin) **wajib mengganti kata sandi saat login pertama**: web diarahkan ke `/ganti-password`;
  API menjawab `403 PASSWORD_CHANGE_REQUIRED` kecuali `GET /api/v1/me` dan `POST /api/v1/me/password`. Aplikasi native perlu login ulang
  (`/api/v1/auth/token`) setelah mengganti kata sandi agar token barunya bersih dari penanda itu.
- Semua orang bisa mengganti kata sandi sendiri lewat tombol **Ganti sandi** di pojok kanan atas.
- Superadmin bisa **mengubah role**, **mereset kata sandi**, **menonaktifkan/mengaktifkan** akun (`PATCH /api/v1/persons/{id}/account`).
  Akun Superadmin hanya bisa diubah Superadmin, dan harus selalu tersisa minimal satu Superadmin aktif.
- Akun dummy dan akun seed tidak dipaksa ganti kata sandi.
- Setelah memperbarui kode ini jalankan `npx prisma migrate dev --name user_password_flag` (menambah kolom `mustChangePassword` dan `passwordChangedAt`).

## Tes dan pemeriksaan

```
npm test          # tes unit logika murni (pengulangan rapat, paging, RBAC, zona waktu, nama)
npm run typecheck # tsc --noEmit
npm run check     # keduanya
```

Cek hidup: `GET /api/health` (tanpa login). Panduan deploy ada di [DEPLOY.md](DEPLOY.md).

## Data dummy (hanya untuk mencoba)

`npm run db:seed:dummy` mengisi 34 orang dengan kemampuan pelayanan, dan 5 akun (kata sandi semuanya `Dummy#1234`):
Penjadwal `penjadwal@dummy.local`, Admin Tim pemusik `admin.pemusik@dummy.local`, Admin Tim EBM `admin.ebm@dummy.local`,
Petugas Absen `absen@dummy.local`, Pelayan `pelayan@dummy.local`. Superadmin memakai akun dari `.env`.

Untuk produksi: pakai database baru, jalankan hanya `npm run db:seed`, dan isi `DUMMY_SEED_BLOCK=1` di `.env` produksi
supaya seed dummy menolak berjalan.

## Status roadmap

- [x] W1T1 Inisialisasi proyek
- [x] W1T2 Schema Prisma + file constraint btree_gist
- [x] W1T3 Seed
- [x] W1T4 Auth NextAuth v5 + token Bearer
- [x] W1T5 RBAC
- [x] W1T6 Utilitas (penomoran EV, idempotency, audit log, status flow)
- [x] W2T1 Person dan lookup (posisi, CG, komunitas, ruangan)
- [x] W2T2 Tim, posisi pelayanan, ruangan
- [x] W2T3 Kemampuan orang (PersonMinistry) dan akun login
- [x] W3T1 Template acara (Superadmin dan Penjadwal)
- [x] W3T2 Generate acara DRAFT dari template (termasuk Sabtu ke-4)
- [x] W3T3 Edit acara: waktu, ruangan, tim dan kursi dinamis
- [x] W4T1 Layanan Booking (cek, buat, lepas, terjemahan error 23P01)
- [x] W4T2 Penugasan + suggestion tersedia/tidak tersedia
- [x] W4T3 Terbitkan, tarik, batalkan, override Superadmin
- [x] W5T1 Sesi latihan: peserta otomatis, wajib/tidak wajib, tombol massal per tim
- [x] W6T1 API kalender dan detail acara, filter sesuai role
- [x] W6T2 "Jadwal saya"
- [x] W9T1-W9T2 Template Fellowship dan generator Sabtu ke-4 (sudah di W3)
- [x] W9T3 API kehadiran (jumlah saja / per nama, petugas absen, tamu baru)
- [x] W7T1 Shell aplikasi dan dashboard kalender (halaman login dan kalender)
- [x] W7T2 Form jadwal acara: daftar, buat (template/khusus), editor dengan suggestion dan tanda bentrok
- [x] W7T3 Halaman Template acara, Orang & pelayanan (termasuk akun login), Ruangan dan daftar pilihan (posisi, CG, komunitas)
- [x] Notulen (draf, final, revisi), cetak/PDF, bagikan ke WhatsApp sebagai gambar
- [x] Kunci notulen: isi notulen (baca, tulis, finalkan, revisi, cetak) baru terbuka setelah pemilik akun memasukkan kata sandinya lagi; berlaku 60 menit (cookie bertanda tangan terikat akun dan sesi), salah 5 kali dalam 15 menit dikunci 15 menit, tombol "Kunci sekarang", dan dialog kata sandi bila waktunya habis saat menulis (isian tidak hilang); pembukaan tercatat di log aktivitas; tanpa migrasi
- [x] Rapat berulang, log aktivitas, profil gereja
- [x] Jenis rapat saat membuat: "Hanya jadwal" (agenda atau pinjam ruangan; seluruh anggota tetap menerima pengingat, tanpa daftar hadir, notulen, lampiran) atau "Rapat lengkap". Bawaan rapat baru: hanya jadwal; rapat lama tetap lengkap. Bisa diubah di Ubah jadwal selama belum ada notulen
- [x] Kehadiran rapat lengkap hanya bisa diubah oleh orangnya sendiri atau anggota yang berhak "kelola anggota" (Admin Tim selalu; tamu dan "tandai semua hadir" hanya oleh pengelola anggota). Undang/hapus peserta dan lampiran tetap oleh anggota yang berhak menjadwalkan atau menulis notulen; ditegakkan di server
- [x] Tampil di kalender: tiap rapat dipilih "Anggota kelompok saja" (juga Penjadwal/Superadmin; yang lain hanya melihat "Ruangan terpakai" di papan ruangan) atau "Semua orang" (termasuk pelayan yang bukan anggota kelompok mana pun: waktu, ruangan, nama kelompok; topik bila diizinkan). Bawaan rapat baru: anggota kelompok saja; rapat lama tetap semua orang
- [x] Satu kelompok tidak bisa punya dua rapat yang jamnya beririsan (ruangan berbeda atau online pun ditolak); berlaku saat membuat dan saat mengubah jam. Anggota yang sudah diundang ke rapat kelompok lain pada jam yang sama diperingatkan di form
- [x] Jadwal saya juga memuat rapat kelompok yang saya ikuti dan saya diundang (filter Jenis: Rapat); barisnya membuka halaman rapat. Rapat yang dibatalkan tidak tampil
- [x] Rapat "anggota kelompok saja": Penjadwal dan Superadmin hanya melihatnya bila offline (memakai ruangan); bila online tidak terlihat sama sekali. Pemeriksaan bentrok tetap membaca semua rapat: penugasan, latihan, dan peringatan di form rapat ikut memeriksa anggota yang sudah diundang ke rapat lengkap lain pada jam yang sama (labelnya disamarkan "Rapat kelompok"); rapat "hanya jadwal", yang dibatalkan, atau yang ditandai izin/tidak hadir tidak dihitung
- [x] Tampilan HP: Jadwal saya, isi kehadiran, menu bawah; filter dan tab lengket di semua halaman
- [x] W8 Tes unit, health check, header keamanan, panduan deploy
- [x] Minta pengganti: pelayan meminta kursinya digantikan (alasan, usulan nama), Penjadwal atau Admin Tim tim itu mengisi penggantinya seperti biasa atau menolak; selesai otomatis saat kursi berganti. Migrasi `20261125210000_minta_pengganti`
- [x] Cadangan data: Superadmin mengunduh satu berkas Excel (orang, tim, ruangan, CG, template, jadwal 12 bulan, akun) dari Pengaturan > Cadangan data; tanpa isi rapat, kata sandi, dan kunci; pengingat bulanan tiap tanggal 1
- [x] Statistik beban pelayan: Jadwal acara > Beban pelayan; berapa ibadah tiap orang bertugas per bulan (satu ibadah dihitung sekali walau memegang dua posisi), rincian per tim, penanda beban tinggi dan yang belum bertugas, unduh Excel; Penjadwal melihat semua tim, Admin Tim hanya timnya sendiri; tanpa migrasi
