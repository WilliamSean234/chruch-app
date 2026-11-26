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
  Akun Superadmin hanya bisa diubah Superadmin, dan harus selalu tersisa minimal satu Superadmin aktif. **Superadmin utama** (pemilik, ditandai di database) dilindungi: Superadmin lain tidak bisa mengubah, menonaktifkan, menghapus, atau mereset akunnya (sandi, email, role, 2 langkah); pemiliknya sendiri bisa. Penandanya hanya bisa diubah dari terminal: `npm run db:set-owner -- email@contoh.com --apply`. Superadmin juga **dibatasi maksimal 2 akun aktif** (membuat akun Superadmin, memberi role Superadmin, atau mengaktifkan kembali Superadmin nonaktif ditolak bila sudah ada 2).
- **Satu browser, satu akun**: bila di satu tab Anda masuk dengan akun lain (atau keluar), tab lain di browser yang sama otomatis keluar saat itu juga, tanpa perlu diklik: muncul pemberitahuan sebentar lalu dialihkan ke halaman masuk. Halaman masuk memberi tahu tab lain lewat BroadcastChannel (dengan cadangan `storage`), dan tiap tab memeriksa ke server `/api/v1/me` siapa yang sedang login, jadi yang menentukan adalah server, bukan isi pesan. Pemeriksaan yang sama jalan saat tab dibuka kembali. Dua akun sekaligus tetap bisa dipakai bila salah satunya di jendela Incognito atau profil browser lain.
- **Status online di Orang & pelayanan**: orang yang punya akun diberi titik di pojok avatarnya, hijau bila sedang membuka aplikasi dan abu-abu bila tidak, lalu ada filter *Status* (Online / Offline). Tab yang terlihat dan dipakai mengirim tanda tiap 15 detik (`POST /api/v1/me/presence`, tabel `Presence`, satu baris per tab); menutup tab, pindah ke tab lain, keluar, atau diam 5 menit langsung dicatat offline, dan bila sinyalnya hilang (HP mati, jaringan putus) server menganggap offline setelah 40 detik. Halaman Orang & pelayanan memeriksa daftar online tiap 4 detik selama terlihat dan dipakai, jadi titiknya berubah sekitar 4 detik setelah orangnya masuk atau keluar, dan tabelnya ikut dimuat ulang: yang online selalu paling atas (di semua halaman tabel, bukan hanya halaman pertama), lalu yang lain, masing-masing urut nama. Yang melihat titiknya hanya yang berhak membuka halaman itu (`person.write`).
- **Penanda angka di menu, langsung tanpa muat ulang**: *Pengaturan* menampilkan jumlah permintaan daftar yang menunggu, dan *Jadwal acara* menampilkan jumlah permintaan pengganti dari pelayan (untuk Penjadwal, atau Admin Tim untuk timnya). Angkanya berubah seketika setelah Anda menyetujui, menolak, atau mengisi pengganti, dan muncul sendiri saat ada permintaan baru: tab yang terlihat memeriksa `GET /api/v1/me/badges` tiap 30 detik (juga saat tab dibuka lagi). Pemeriksaan berhenti bila tab tersembunyi atau penggunanya diam 10 menit, dan hanya dijalankan untuk pengguna yang bisa menerima permintaan, supaya database gratis boleh tidur. Daftar permintaan di halaman ikut dimuat ulang bila angkanya berubah.
- **Acara khusus komunitas**: acara satu kali, acara yang sedang diubah, dan template acara punya pilihan **Khusus komunitas tertentu** (mis. Fellowship untuk Pemuda). Semua anggota komunitas yang dipilih melihat acara itu di **Jadwal saya** (baris berlabel *Komunitas*, filter Jenis → Komunitas) tanpa perlu ditugaskan; acara yang sudah ada di daftar tugasnya tidak diulang, DRAFT hanya terlihat penjadwal. Acara tetap tampil di kalender umum. Migrasi `20261126180000_acara_khusus_komunitas`; API: `audienceCommunityIds` di acara dan template.
- **Jabatan wajib di setiap kelompok rapat bernama "Pengelola Kelompok"** (sebelumnya "Admin Tim"; diganti supaya tidak tertukar dengan role Admin Tim, pengelola satu tim pelayanan). Hak dan pemegangnya tidak berubah; migrasi `20261126160000_pengelola_kelompok` mengganti nama yang sudah ada. File Excel lama yang masih menulis jabatan "Admin Tim" tetap terbaca sebagai Pengelola Kelompok. Role Admin Tim EBM tetap otomatis menjadi Pengelola Kelompok di kelompok EBM.
- **Ubah role**: tiap role menampilkan jumlah akun aktif pemegangnya (`n/x`; hanya Superadmin yang punya batas, 2). Mengetuk role menampilkan daftar akun pemegangnya (`GET /api/v1/accounts/roles`). Role yang penuh (Superadmin 2/2) tidak bisa dipilih, tetapi bisa **dipindahkan**: tombol *Pindahkan ke …* di daftar memindahkan role dari akun A ke akun B dalam satu transaksi (`POST /api/v1/accounts/transfer-role`), tercatat di Log aktivitas. Role Superadmin diperketat: hanya **Superadmin utama** yang boleh memindahkannya, hanya dari akun aktif (bukan akun utama), harus memasukkan kata sandi (dan kode 2 langkah bila aktif) lagi, dan sesi akun asal langsung dicabut. **Kursi per role**: Superadmin utama mengatur batas jumlah akun aktif untuk Penjadwal, Admin Tim, Admin Jemaat, dan Pengawas di **Pengaturan → Kelola akun → Kursi per role** (`PUT /api/v1/accounts/role-limits`; kosong = tanpa batas; tidak boleh di bawah jumlah pemegang saat ini; tercatat di Log aktivitas; migrasi `20261126170000_kursi_role`). Batas Superadmin dikunci di kode (2); Pelayan dan Petugas Absen tidak dibatasi. Berlaku saat membuat akun, memberi role, dan mengaktifkan akun nonaktif. Impor Excel tidak memeriksa batas ini.
- **Verifikasi 2 langkah (khusus Superadmin)**: **Profil → Keamanan akun** (`/profil/keamanan`) memandu 3 langkah: pasang aplikasi autentikator (Google/Microsoft Authenticator, Authy), pindai kode QR (atau ketik kunci manual), lalu ketik 6 angka untuk mengaktifkan. Setelah itu masuk butuh kata sandi **dan** kode 6 angka.
  Tiap akun punya kunci sendiri. Kunci disimpan terenkripsi dengan `MINUTES_ENC_KEY` (sama seperti notulen, jadi kunci itu tidak boleh berubah). Kode 6 angka hanya berlaku sekali. Kode salah dihitung seperti sandi salah (dibatasi, bisa terkunci sementara).
  Saat diaktifkan, 8 **kode cadangan** sekali pakai ditampilkan satu kali (disimpan sebagai hash). Kalau HP hilang: pakai kode cadangan di halaman masuk, atau Superadmin lain menekan **Reset 2 langkah** di Pengaturan → Kelola akun (sesi akun itu dicabut, tercatat di Log aktivitas).
  Darurat dari terminal: `npm run db:reset-2fa -- email@contoh.com` (simulasi), tambah `--apply` untuk mereset. Belum diwajibkan: Superadmin tanpa 2 langkah hanya melihat banner pengingat. Aplikasi native: `POST /api/v1/auth/token` menjawab `401 TWO_FACTOR_REQUIRED`; kirim ulang dengan field `code`.
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
- [x] Kehadiran rapat lengkap hanya bisa diubah oleh orangnya sendiri atau anggota yang berhak "kelola anggota" (Pengelola Kelompok selalu; tamu dan "tandai semua hadir" hanya oleh pengelola anggota). Undang/hapus peserta dan lampiran tetap oleh anggota yang berhak menjadwalkan atau menulis notulen; ditegakkan di server
- [x] Tampil di kalender: tiap rapat dipilih "Anggota kelompok saja" (juga Penjadwal/Superadmin; yang lain hanya melihat "Ruangan terpakai" di papan ruangan) atau "Semua orang" (termasuk pelayan yang bukan anggota kelompok mana pun: waktu, ruangan, nama kelompok; topik bila diizinkan). Bawaan rapat baru: anggota kelompok saja; rapat lama tetap semua orang
- [x] Satu kelompok tidak bisa punya dua rapat yang jamnya beririsan (ruangan berbeda atau online pun ditolak); berlaku saat membuat dan saat mengubah jam. Anggota yang sudah diundang ke rapat kelompok lain pada jam yang sama diperingatkan di form
- [x] Jadwal saya juga memuat rapat kelompok yang saya ikuti dan saya diundang (filter Jenis: Rapat); barisnya membuka halaman rapat. Rapat yang dibatalkan tidak tampil
- [x] Rapat "anggota kelompok saja": Penjadwal dan Superadmin hanya melihatnya bila offline (memakai ruangan); bila online tidak terlihat sama sekali. Pemeriksaan bentrok tetap membaca semua rapat: penugasan, latihan, dan peringatan di form rapat ikut memeriksa anggota yang sudah diundang ke rapat lengkap lain pada jam yang sama (labelnya disamarkan "Rapat kelompok"); rapat "hanya jadwal", yang dibatalkan, atau yang ditandai izin/tidak hadir tidak dihitung
- [x] Tampilan HP: Jadwal saya, isi kehadiran, menu bawah; filter dan tab lengket di semua halaman
- [x] W8 Tes unit, health check, header keamanan, panduan deploy
- [x] Minta pengganti: pelayan meminta kursinya digantikan (alasan, usulan nama), Penjadwal atau Admin Tim tim itu mengisi penggantinya seperti biasa atau menolak; selesai otomatis saat kursi berganti. Migrasi `20261125210000_minta_pengganti`
- [x] Cadangan data: Superadmin mengunduh satu berkas Excel (orang, tim, ruangan, CG, template, jadwal 12 bulan, akun) dari Pengaturan > Cadangan data; tanpa isi rapat, kata sandi, dan kunci; pengingat bulanan tiap tanggal 1
- [x] Statistik beban pelayan: Jadwal acara > Beban pelayan; berapa ibadah tiap orang bertugas per bulan (satu ibadah dihitung sekali walau memegang dua posisi), rincian per tim, penanda beban tinggi dan yang belum bertugas, unduh Excel; Penjadwal melihat semua tim, Admin Tim hanya timnya sendiri; tanpa migrasi
