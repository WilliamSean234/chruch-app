# Deploy ke produksi (Vercel + Neon)

Urutannya sengaja berurutan. Jangan lompat ke langkah 5 sebelum langkah 1-4 selesai.

## 1. Database (Neon)

- Buat project baru **khusus produksi** di wilayah **Singapura** (`ap-southeast-1`), jangan pakai database percobaan.
- Salin dua alamat koneksi:
  - `DATABASE_URL` = koneksi **pooled** (host berakhiran `-pooler`), untuk aplikasi.
  - `DIRECT_URL` = koneksi **langsung**, untuk migrasi.
- Aktifkan ekstensi `btree_gist` tidak perlu manual: file migrasi `booking_no_overlap` yang membuatnya.

## 2. Kode

- Folder `prisma/migrations/` **harus ikut di-commit**, termasuk migrasi `booking_no_overlap` (constraint anti-bentrok). Tanpa ini produksi tidak punya perlindungan bentrok.
- Pastikan lolos di laptop: `npm run check` (cek tipe + tes) lalu `npm run build`.

## 3. Variabel lingkungan di Vercel

| Nama | Isi |
|---|---|
| `DATABASE_URL` | koneksi pooled Neon produksi |
| `DIRECT_URL` | koneksi langsung Neon produksi |
| `AUTH_SECRET` | string acak baru, bukan yang dipakai saat pengembangan (`npx auth secret`) |
| `APP_TIMEZONE` | `Asia/Jakarta` |
| `DUMMY_SEED_BLOCK` | `1` (supaya seed dummy menolak berjalan) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | kunci notifikasi HP; buat sekali dengan `npx web-push generate-vapid-keys`. Tanpa ini notifikasi tidak aktif (aplikasi tetap jalan) |
| `VAPID_SUBJECT` | `mailto:` diikuti email pengelola, mis. `mailto:admin@gereja.org`, atau alamat situs `https://...` |
| `SMTP_USER`, `SMTP_PASS` | akun pengirim email: alamat Gmail dan **Sandi Aplikasi** Google (bukan sandi Gmail biasa; butuh verifikasi 2 langkah aktif, lalu buat di akun Google → Keamanan → Sandi aplikasi). Tanpa ini email mati dan pendaftaran tetap seperti biasa tanpa verifikasi email |
| `MAIL_FROM` | opsional, mis. `Penjadwalan Gereja <alamat@gmail.com>` |
| `APP_URL` | opsional, alamat dasar untuk tautan di email; bawaannya alamat produksi Vercel |
| `CRON_SECRET` | string acak apa saja (mis. hasil `npx auth secret`). Dipakai Vercel untuk menjalankan pengingat terjadwal; tanpa ini pengingat otomatis tidak berjalan |

`SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD` cukup diisi di laptop saat langkah 5, tidak perlu di Vercel.

## 4. Deploy pertama

- Hubungkan repo ke Vercel. Build memakai skrip `vercel-build`, yaitu `prisma generate` lalu `prisma migrate deploy` lalu `next build`. Bila migrasi gagal, deploy ikut gagal (itu memang yang diinginkan).
- `vercel.json` sudah menetapkan fungsi berjalan di Singapura (`sin1`), dekat database.

## 5. Data awal (sekali saja, dari laptop)

Arahkan `.env` sementara ke database produksi (`DATABASE_URL`, `DIRECT_URL`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` yang kuat), lalu:

```
npm run db:seed
```

Lalu perbarui hak peran bawaan (aman diulang, hanya menambah hak yang kurang, tidak mengurangi apa pun):

```
npm run db:fix-roles
```

Hak disimpan di token login, jadi setiap pengguna perlu **keluar lalu masuk lagi** setelah perintah ini agar hak barunya berlaku (misalnya tombol Isi kehadiran).

Orang yang sudah melayani di bidang EBM otomatis masuk kelompok rapat **EBM** (dibuat bila belum ada) setiap kali posisinya diisi lewat form Orang atau impor Excel. Untuk data yang sudah ada sebelumnya, jalankan sekali (aman diulang, hanya menambah anggota):

```
npm run db:sync-ebm
```

Data awal bisa juga diisi lewat **Pengaturan → Impor Excel**: unduh template, isi sheet Orang, Pelayanan, Akun, TemplateAcara, serta KelompokRapat, JabatanKelompok, dan AnggotaKelompok. Acara, penugasan, latihan, dan rapat dibuat lewat aplikasi, bukan Excel. Unggahan boleh diulang karena data yang sudah ada dilewati (pelayanan baru untuk orang yang sudah ada tetap ditambahkan).

**Jawaban kuesioner** ("Formulir Pendataan Pelayanan Gereja") bisa diunggah langsung di menu yang sama, tanpa file perantara: aplikasi mengenalinya dari nama tab dan mengubahnya ke format impor. Unggah dulu file yang tab 1 (Orang)-nya terisi, baru file yang hanya mengisi tab lain. Catatan di layar pemeriksaan menyebut apa yang tidak ikut diimpor (No HP/Email di tab 1, pelayanan bertanda Hapus, orang tanpa email di tab 4).

Jangan jalankan `db:seed:dummy`, `db:seed:groups`, atau `db:seed:meetings` di produksi. Setelah selesai, kembalikan `.env` ke database percobaan agar tidak salah sasaran.

## 6. Pemeriksaan setelah deploy

- [ ] `https://DOMAIN/api/health` menjawab `{"status":"ok"}`.
- [ ] Masuk sebagai Superadmin, ganti kata sandi, lalu isi **Pengaturan → Profil gereja**.
- [ ] Tambah ruangan, orang, dan satu template; buat satu jadwal lalu terbitkan.
- [ ] Setelah `db:fix-roles`, masuk ulang sebagai Penjadwal: tombol **Isi kehadiran** muncul di detail acara pada Kalender.
- [ ] Coba impor `contoh-data-gereja.xlsx` di database percobaan (bukan produksi): semua sheet harus lolos tanpa baris bermasalah.
- [ ] Buat Ibadah Minggu I dengan tickbox pasangan: Ibadah Minggu II ikut terbuat di hari yang sama. Isi kursi di salah satunya, lalu di yang lain tekan **Isi dari ...**. Coba PIC yang sama sebagai Usher (boleh, ada catatan) dan orang EBM sebagai Usher (ditolak).
- [ ] Buka `/daftar` dari HP: isi form (email salah harus ditolak, syarat kata sandi berubah hijau), lalu di **Pengaturan → Permintaan daftar** setujui dengan menautkan ke orang yang sudah ada, dan masuk dengan akun itu.
- [ ] Coba bentrok: dua acara di ruangan dan jam yang sama harus ditolak.
- [ ] Buat satu akun Pelayan biasa: pastikan ia **tidak** melihat rapat dan hanya melihat jadwalnya di **Jadwal saya**.
- [ ] Buat satu kelompok dan rapat; pastikan notulen hanya terbaca anggota kelompok (Superadmin tidak bisa membaca isinya).
- [ ] Buka dari HP: Jadwal saya, isi kehadiran, bagikan notulen ke WhatsApp sebagai gambar.

## 7. Operasional

- **Pendaftaran akun:** halaman `/daftar` terbuka untuk umum, tetapi hanya membuat *permintaan*. Akun baru ada setelah admin menyetujuinya di Pengaturan → Permintaan daftar. Pembatas: 5 permintaan per alamat per jam dan 300 permintaan menunggu sekaligus.

- **Cadangan:** Neon menyimpan riwayat untuk pemulihan ke titik waktu; cek lama retensi paket Anda, dan uji sekali cara memulihkannya sebelum dibutuhkan.
- **Pemantau:** arahkan UptimeRobot (atau sejenisnya) ke `/api/health`.
- **Migrasi berikutnya:** buat di laptop dengan `npx prisma migrate dev --name nama`, commit folder migrasinya, lalu push. Vercel menjalankannya saat build.
- **Log aktivitas:** Pengaturan → Log aktivitas (hanya Superadmin).

## Pembatasan percobaan login

Tersimpan di tabel `LoginThrottle` (migrasi `login_throttle`), jadi tetap berlaku di Vercel yang tanpa memori bersama.

- 5 kali salah dari satu alamat untuk satu email: pasangan itu terkunci 15 menit. Orang di alamat lain tetap bisa masuk, jadi akun Superadmin tidak bisa dikunci orang luar.
- 20 kali salah untuk satu email dari banyak alamat, atau 30 kali dari satu alamat ke banyak email: terkunci 15 menit.
- Login berhasil mengosongkan hitungan pasangan alamat+email itu. Email yang tidak ada dihitung sama dengan sandi salah.
- Berlaku untuk halaman login dan `POST /api/v1/auth/token` (jawaban 429 `TOO_MANY_ATTEMPTS`).
- Bila tabelnya bermasalah, login tetap jalan tetapi error `[login-throttle] ... TIDAK aktif` muncul di log: pantau log setelah deploy.
- Alamat klien dibaca dari `x-forwarded-for` (Vercel mengisinya dengan alamat pengunjung). Di balik proxy lain, pastikan header itu tidak bisa dipalsukan pengunjung.

## Yang belum ada (catat sebagai pekerjaan lanjutan)

- Pembatasan login sudah ada di aplikasi (lihat bagian bawah). Untuk perlindungan lapis kedua, aktifkan juga Vercel Firewall (rate limit di `/api/auth/*` dan `/api/v1/auth/token`).
- Content-Security-Policy baru bagian aman (anti-bingkai, `<base>`, `<object>`, tujuan form). Pembatasan skrip/gaya (`script-src`) belum dipasang karena perlu nonce per permintaan dan diuji di browser.
- Tes yang ada baru tes unit logika murni. Skrip `scripts/test-konflik.ps1` dan `scripts/test-latihan.ps1` menguji alur API terhadap server yang berjalan.

## Jadwal tim EBM (unggah dan bagikan)

- Halaman: **Jadwal acara → Jadwal tim** (`/jadwal/tim`). Untuk pemegang `assignment.write` (Superadmin dan Admin Tim; Admin Tim dibatasi ke timnya).
- Migrasi `20261120170000_person_nickname` menambah kolom **nama panggilan** dan **ejaan lain** pada Person. Vercel menjalankannya otomatis saat build. Lokal: `npx prisma migrate deploy` lalu `npx prisma generate`.
- Unggahan pertama membuat/menyamakan 7 posisi tim EBM (PIC EBM, Cameramen, Soundman, Lighting+LED, Easy Worship LED, PPT Prompter, BM+VMOX) dan menyesuaikan template Ibadah Minggu I dan II. Posisi lama tidak dihapus.
- Satu baris tanggal berlaku untuk dua ibadah. Acara yang belum ada dibuat sebagai DRAFT; yang sudah ada hanya diganti petugas tim EBM-nya. Tanggal yang sudah lewat dan acara batal dilewati.
- Format file diatur di `src/lib/teamFormats.ts`. Tim lain (pemusik, dst.) cukup menambah format baru di sana setelah template-nya ada.
- **Usher**: kolom dikelompokkan per ibadah (KU1 = Ibadah Minggu I, KU2 = Ibadah Minggu II), tiap kelompok beberapa kursi untuk posisi "Usher". Jumlah kursi mengikuti sel gabungan di file (bawaan 3 dan 4). Tanggal boleh angka hari di bawah judul bulan atau tanggal lengkap ("1 Nov 2026"), jadi satu header untuk setahun juga terbaca. Unggahan menyamakan kursi Usher di template Ibadah Minggu I/II dan acara yang disentuh; warna sel di file tidak dibaca.

## Penatalayan ibadah, Band / No Band, Tema, Padus

- Tim "Pimpinan ibadah" berganti nama menjadi **Penatalayan ibadah** dan **Tim pemusik digabung** ke dalamnya (PIC, Liturgos/WL, Pembicara, Keyboard, Piano, Bass, Gitar, Drum, Singer, dst). Penggabungan dijalankan oleh migrasi `20261120230000_penatalayan_theme_band` saat `prisma migrate deploy` di build Vercel. Aman dijalankan ulang. Bila ada posisi dengan nama sama di dua tim, posisi itu tetap di tim lama; rapikan lewat Orang › Pelayanan.
- Setelah menarik kode: jalankan `npx prisma generate` di laptop (kolom baru: `Event.theme`, `Event.padus`, `Event.bandMode`, `Ministry.bandOnly`).
- **Band / No Band**: ibadah baru otomatis Band. "Jadikan No Band" menghapus posisi bertanda *Posisi band* (bass, gitar, drum, kajon) dari acara itu dan melepas orangnya; "Kembalikan ke Band" memulihkan dari template. Tanda *Posisi band* diatur di Orang › Pelayanan.
- **Tema ibadah** (maks 600 huruf) dan **Padus** (catatan teks, maks 200 huruf) bersifat opsional; diisi di form acara, tampil di detail acara kalender.
- Admin Tim lama untuk Tim pemusik otomatis dipindah ke Penatalayan ibadah.

### Jadwal tim Penatalayan (unggah dan bagikan)

- Pilih tim **Penatalayan** di **Jadwal acara → Jadwal tim**. Satu baris tanggal berlaku untuk Ibadah Minggu I dan II. Tata letak file (sama untuk template, export, dan unggahan): TGL | Liturgos | **Pemusik** (Band/No Band, Keyboard, Piano, Bass, Gitar, Drum, …) | **Backing Vocal** (Singer 1, 2, …) | PIC | Padus | Tema. Header dua baris dengan sel gabungan, warna sama seperti EBM dan Usher.
- Kolom dinamis: tambah kolom di bawah judul **Pemusik** dan beri nama (mis. "Gitar 2", atau alat baru seperti "Kajon"); jumlah kursi Backing Vocal mengikuti sel gabungan di file. Kolom tanpa nama di bawah Pemusik ditolak dengan petunjuk, jadi pakai template dari halaman ini.
- **Band / No Band** per baris. No Band mengosongkan Bass, Gitar, Drum (dan posisi bertanda *Posisi band*), isian di kolom itu diabaikan dengan catatan. **Padus** dan **Tema** teks bebas (maks 200 dan 600 huruf); kolom yang ada di file menimpa acara (sel kosong = dikosongkan), kolom yang tidak ada di file tidak mengubah apa pun.
- Isi sel dibersihkan otomatis: catatan dalam kurung (mis. "(B)", "(KKR)") dibuang, "A ganti B" dipakai A, banyak nama dalam satu sel hanya nama pertama yang dipakai (peringatan muncul; tambah kolom "Gitar 2" dst. untuk nama berikutnya), TBC/-/? dianggap kosong. Tahun tanggal 2 angka ("4-Oct-26") terbaca.
- File adalah acuan untuk tim ini: posisi yang tidak ada kolomnya di file dilepas dari template dan acara yang disentuh, kecuali **Pembicara** yang selalu dipertahankan.
- Tema/Padus/Band diterapkan ke Ibadah Minggu I dan II sekaligus. Acara yang sudah lewat 2 bulan tetap terkunci dan dilewati.

## Pengingat terjadwal (cron)

`vercel.json` menjadwalkan tiga pekerjaan (hanya berjalan di deploy Production; paket Hobby paling sering sekali sehari, jamnya bisa meleset sampai sekitar 1 jam):

| Jalur | Waktu (WIB) | Isi |
|---|---|---|
| `/api/cron/ultah` | sekitar 06.00 tiap hari | kabari semua akun siapa yang berulang tahun hari ini (tidak dikirim bila tidak ada; bisa dimatikan tiap pemilik akun di Profil) |
| `/api/cron/harian` | sekitar 17.00 tiap hari | pengingat H-1 pelayan (acara dan latihan besok), pengingat H-1 rapat kelompok, kehadiran belum diisi (penjadwal), pelanggaran aturan baru (penjadwal) |
| `/api/cron/bulanan` | sekitar 08.00 tanggal 1 | ringkasan jadwal tiap orang untuk bulan itu (tidak dikirim bila kosong) |

Tiap pekerjaan mengirim satu pesan gabungan per orang dan tidak mengirim apa pun bila tidak ada isinya. Menjalankan ulang di hari yang sama aman (pesan tidak dobel).

Mencoba tanpa menunggu jadwal (ganti `RAHASIA` dengan nilai `CRON_SECRET`):

```
curl -H "Authorization: Bearer RAHASIA" https://jadwal-elyon.vercel.app/api/cron/harian
```

Hasilnya berupa JSON ringkasan (berapa orang yang dituju dan berapa yang terkirim).

## Email: verifikasi dan cadangan notifikasi

Bila `SMTP_USER` dan `SMTP_PASS` diisi:

- Pendaftar baru menerima email berisi tautan verifikasi (berlaku 24 jam). Admin baru bisa menyetujui permintaan setelah emailnya terverifikasi.
- Akun yang sudah ada bisa memverifikasi emailnya dari Profil (tombol Kirim email verifikasi).
- Pesan notifikasi yang tidak bisa dikirim ke HP (belum diaktifkan) dikirim lewat email, **hanya** ke alamat yang sudah terverifikasi. Orang yang notifikasi HP-nya aktif tidak menerima email dobel.

Gmail membatasi sekitar 500 email per hari untuk akun biasa, cukup untuk gereja ukuran ini.
