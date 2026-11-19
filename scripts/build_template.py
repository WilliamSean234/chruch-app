import datetime as dt
import sys
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter as L
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation

INDIGO, INDIGO_SOFT, GOLD, GOLD_SOFT, INK, GRAY = "3037A8", "E6E8F8", "C28E2C", "FFF3D6", "1B1D3A", "6B7280"
FONT = "Arial"
HDR, DATA0, ROWS = 3, 4, 500          # baris judul kolom, baris data pertama, jumlah baris yang disiapkan
thin = Side(style="thin", color="D0D3E8")
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
d = dt.date
t = dt.time

def f(**k): return Font(name=FONT, size=k.pop("size", 10), **k)

# ───────────────────────── Data pilihan (bawaan, sama dengan seed aplikasi) ─────────────────────────
POSISI = ["Jemaat", "Pembina pemuda", "Pembina remaja", "Pengurus pemuda", "Pendeta", "Pembicara tamu"]
CG = ["CG Rungkut", "CG Darmo", "CG Citraland", "CG Gubeng"]
KOMUNITAS = ["Pemuda", "Young couple", "Anak-anak"]
TIM = ["Pimpinan ibadah", "Tim pemusik", "Tim EBM", "Usher", "Tim publikasi"]
PELAYANAN = (
    [("Pimpinan ibadah", "PIC", "Tidak"), ("Pimpinan ibadah", "Liturgos (WL)", "Ya"), ("Pimpinan ibadah", "Pembicara", "Tidak")]
    + [("Tim pemusik", n, "Ya") for n in ["Keyboard", "Piano", "PSR", "Bass", "Gitar", "Kajon", "Drum", "Singer"]]
    + [("Tim EBM", n, "Tidak") for n in ["LCD", "Sound", "Lighting", "Multimedia"]]
    + [("Usher", "Usher", "Tidak"), ("Tim publikasi", "Desain e-flyer", "Tidak")]
)
RUANGAN = [("Ruang A", "Ya"), ("Ruang B", "Ya"), ("Ruang C", "Ya")]

# ───────────────────────── Contoh data ─────────────────────────
# (gelar, nama, lahir, jk, posisi, cg, komunitas, asal, gereja asal, pelayanan)
ORANG = [
    (None, "Setia Budi", d(1984, 3, 12), "L", "Jemaat", "CG Rungkut", "Young couple", "Dalam", None, "PIC, Liturgos (WL)"),
    (None, "Maria Susanti", d(1986, 7, 2), "P", "Jemaat", "CG Rungkut", "Young couple", "Dalam", None, "Liturgos (WL)"),
    ("Pdt.", "Lukas Hartono", d(1975, 9, 9), "L", "Pendeta", None, None, "Dalam", None, "Pembicara"),
    ("Ps.", "Chen Wei", d(1980, 4, 4), "L", "Pembicara tamu", None, None, "Luar", "GKI Pondok Indah", "Pembicara"),
    (None, "Ruth Natalia", d(1991, 6, 20), "P", "Jemaat", "CG Darmo", None, "Dalam", None, "Usher"),
    (None, "Yohana Putri", d(1990, 1, 30), "P", "Jemaat", "CG Darmo", None, "Dalam", None, "PIC"),
    (None, "Rudy Hermawan", d(1979, 11, 23), "L", "Pembina pemuda", "CG Citraland", None, "Dalam", None, "Liturgos (WL), PIC"),
    (None, "Mei Ling", d(1987, 2, 2), "P", "Jemaat", "CG Gubeng", None, "Dalam", None, "Liturgos (WL), Singer"),
    (None, "Grace Angelina", d(1995, 2, 14), "P", "Jemaat", "CG Darmo", None, "Dalam", None, "Keyboard"),
    (None, "Joshua Wijaya", d(1993, 8, 21), "L", "Jemaat", "CG Citraland", None, "Dalam", None, "Piano, Keyboard"),
    (None, "Samuel Chandra", d(1994, 9, 19), "L", "Jemaat", "CG Gubeng", None, "Dalam", None, "Piano, Keyboard"),
    (None, "Kevin Pratama", d(1996, 6, 6), "L", "Jemaat", "CG Rungkut", None, "Dalam", None, "Bass"),
    (None, "William Santoso", d(2000, 10, 10), "L", "Pengurus pemuda", "CG Rungkut", "Pemuda", "Dalam", None, "Drum, Gitar, Singer, LCD"),
    (None, "Daniel Kurniawan", d(1998, 12, 1), "L", "Jemaat", "CG Gubeng", None, "Dalam", None, "Drum"),
    (None, "Anna Margareta", d(1997, 3, 3), "P", "Jemaat", "CG Darmo", None, "Dalam", None, "Singer"),
    (None, "Nathan Gunawan", d(2003, 5, 25), "L", "Jemaat", "CG Citraland", "Pemuda", "Dalam", None, "Gitar, Kajon"),
    (None, "Priska Lestari", d(2002, 11, 11), "P", "Jemaat", "CG Rungkut", "Pemuda", "Dalam", None, "Singer"),
    (None, "Michael Tanoto", d(1992, 9, 15), "L", "Jemaat", "CG Gubeng", None, "Dalam", None, "LCD, Sound"),
    (None, "Felix Halim", d(1999, 1, 18), "L", "Jemaat", "CG Citraland", None, "Dalam", None, "Sound, Lighting"),
    (None, "Bryan Salim", d(2001, 4, 9), "L", "Jemaat", "CG Rungkut", "Pemuda", "Dalam", None, "Lighting, Multimedia, LCD"),
    (None, "Steven Lim", d(1994, 10, 30), "L", "Jemaat", "CG Darmo", None, "Dalam", None, "Lighting"),
    (None, "Debora Kristina", d(1989, 12, 12), "P", "Jemaat", "CG Rungkut", None, "Dalam", None, "Usher"),
    (None, "Sarah Wulandari", d(1998, 8, 8), "P", "Jemaat", "CG Gubeng", None, "Dalam", None, "Usher"),
    (None, "Jessica Tan", d(2004, 7, 7), "P", "Pengurus pemuda", "CG Citraland", "Pemuda", "Dalam", None, "Desain e-flyer"),
    (None, "Sinta Dewi", None, "P", "Jemaat", None, None, "Dalam", None, None),
]
CGLEADER = [
    ("CG Rungkut", "Setia Budi"), ("CG Rungkut", "Maria Susanti"), ("CG Darmo", "Ruth Natalia"),
    ("CG Citraland", "Rudy Hermawan"), ("CG Gubeng", "Michael Tanoto"), ("CG Gubeng", "Mei Ling"),
]
AKUN = [
    ("Ruth Natalia", "ruth@contoh.id", "Penjadwal", None),
    ("Grace Angelina", "grace@contoh.id", "Admin Tim", "Tim pemusik"),
    ("Michael Tanoto", "michael@contoh.id", "Admin Tim", "Tim EBM"),
    ("Debora Kristina", "debora@contoh.id", "Petugas Absen", None),
    ("William Santoso", "william@contoh.id", "Pelayan", None),
    ("Sinta Dewi", "sinta@contoh.id", "Tanpa role", None),
]
TPL = [  # nama, pola, hari, minggu ke, jam, durasi, ruangan, mode, komunitas
    ("Ibadah Minggu I", "Mingguan", "Minggu", None, t(7, 0), 120, "Ruang A", "Jumlah saja", None),
    ("Ibadah Minggu II", "Mingguan", "Minggu", None, t(9, 30), 120, "Ruang A", "Jumlah saja", None),
    ("Ibadah Mandarin", "Mingguan", "Minggu", None, t(9, 30), 120, "Ruang B", "Jumlah saja", None),
    ("Fellowship Pemuda", "Bulanan", "Sabtu", 4, t(18, 0), 120, "Ruang C", "Per nama", "Pemuda"),
]
FULL = [("PIC", 1), ("Liturgos (WL)", 1), ("Pembicara", 1), ("Keyboard", 1), ("Piano", 1), ("Bass", 1), ("Gitar", 1), ("Drum", 1), ("Singer", 1),
        ("LCD", 1), ("Sound", 1), ("Lighting", 2), ("Usher", 3)]
MANDARIN = [("PIC", 1), ("Liturgos (WL)", 1), ("Pembicara", 1), ("Piano", 1), ("Gitar", 1), ("Singer", 1), ("LCD", 1), ("Sound", 1), ("Usher", 1)]
FELLOW = [("Pembicara", 1), ("Gitar", 1), ("Kajon", 1), ("Multimedia", 1), ("Desain e-flyer", 1)]
SLOT = ([("Ibadah Minggu I", m, n, None) for m, n in FULL] + [("Ibadah Minggu II", m, n, None) for m, n in FULL]
        + [("Ibadah Mandarin", m, n, None) for m, n in MANDARIN] + [("Fellowship Pemuda", m, n, "Tidak") for m, n in FELLOW])
ACARA = [  # judul, tanggal, mulai, selesai, ruangan, template, status, mode
    ("Ibadah Minggu I", d(2026, 12, 6), t(7, 0), t(9, 0), "Ruang A", "Ibadah Minggu I", "Draft", "Jumlah saja"),
    ("Ibadah Minggu II", d(2026, 12, 6), t(9, 30), t(11, 30), "Ruang A", "Ibadah Minggu II", "Draft", "Jumlah saja"),
    ("Ibadah Mandarin", d(2026, 12, 6), t(9, 30), t(11, 30), "Ruang B", "Ibadah Mandarin", "Terbit", "Jumlah saja"),
    ("Fellowship Pemuda", d(2026, 12, 26), t(18, 0), t(20, 0), "Ruang C", "Fellowship Pemuda", "Draft", "Per nama"),
    ("Ibadah Natal 2026", d(2026, 12, 24), t(19, 0), t(21, 0), "Ruang A", None, "Draft", "Jumlah saja"),
]
def seats(judul, tgl, rows): return [(judul, tgl, p, k, o) for p, k, o in rows]
D1, D2, D3 = d(2026, 12, 6), d(2026, 12, 6), d(2026, 12, 26)
PENUGASAN = (
    seats("Ibadah Minggu I", D1, [("PIC", 1, "Setia Budi"), ("Liturgos (WL)", 1, "Maria Susanti"), ("Pembicara", 1, "Lukas Hartono"), ("Keyboard", 1, "Grace Angelina"),
        ("Piano", 1, "Joshua Wijaya"), ("Bass", 1, "Kevin Pratama"), ("Gitar", 1, "Nathan Gunawan"), ("Drum", 1, "Daniel Kurniawan"), ("Singer", 1, "Anna Margareta"),
        ("LCD", 1, "Michael Tanoto"), ("Sound", 1, "Felix Halim"), ("Lighting", 1, "Bryan Salim"), ("Lighting", 2, "Steven Lim"),
        ("Usher", 1, "Debora Kristina"), ("Usher", 2, "Sarah Wulandari"), ("Usher", 3, "Ruth Natalia")])
    + seats("Ibadah Mandarin", D2, [("PIC", 1, "Yohana Putri"), ("Liturgos (WL)", 1, "Mei Ling"), ("Pembicara", 1, "Chen Wei"), ("Piano", 1, "Samuel Chandra"),
        ("Gitar", 1, "William Santoso"), ("Singer", 1, "Priska Lestari"), ("LCD", 1, "Bryan Salim"), ("Sound", 1, "Felix Halim"), ("Usher", 1, "Debora Kristina")])
    + seats("Fellowship Pemuda", D3, [("Pembicara", 1, "Chen Wei"), ("Gitar", 1, "William Santoso"), ("Kajon", 1, "Nathan Gunawan"),
        ("Multimedia", 1, "Bryan Salim"), ("Desain e-flyer", 1, "Jessica Tan")])
)
LATIHAN = [
    ("Ibadah Minggu I", d(2026, 12, 6), d(2026, 12, 3), t(19, 30), 90, "Ruang B", "Latihan musik dan singer"),
    ("Ibadah Minggu I", d(2026, 12, 6), d(2026, 12, 5), t(16, 0), 90, "Ruang B", "Latihan gabungan"),
]

# Kelompok rapat dan rapat (contoh)
KELOMPOK = [("Majelis", 50), ("Pengurus Pemuda", 50), ("Tim EBM", None)]
# kelompok, jabatan, jadwalkan, tulis notulen, finalkan, atur anggota
JABATAN = [
    ("Majelis", "Ketua", "Tidak", "Tidak", "Ya", "Ya"), ("Majelis", "Sekretaris", "Ya", "Ya", "Ya", "Tidak"), ("Majelis", "Bendahara", "Tidak", "Tidak", "Tidak", "Tidak"),
    ("Pengurus Pemuda", "Ketua", "Tidak", "Tidak", "Ya", "Ya"), ("Pengurus Pemuda", "Sekretaris", "Ya", "Ya", "Ya", "Tidak"), ("Pengurus Pemuda", "Penjadwal", "Ya", "Tidak", "Tidak", "Tidak"),
    ("Tim EBM", "Koordinator", "Ya", "Ya", "Ya", "Ya"),
]
ANGGOTA = [
    ("Majelis", "Lukas Hartono", "Ketua"), ("Majelis", "Setia Budi", "Sekretaris"), ("Majelis", "Rudy Hermawan", "Bendahara"), ("Majelis", "Maria Susanti", None),
    ("Pengurus Pemuda", "William Santoso", "Ketua"), ("Pengurus Pemuda", "Jessica Tan", "Sekretaris, Penjadwal"), ("Pengurus Pemuda", "Nathan Gunawan", None), ("Pengurus Pemuda", "Priska Lestari", None),
    ("Tim EBM", "Michael Tanoto", "Koordinator"), ("Tim EBM", "Bryan Salim", None), ("Tim EBM", "Felix Halim", None),
]
RAPAT = [  # kelompok, judul, tanggal, mulai, selesai, ruangan, judul tampil, peserta tampil
    ("Majelis", "Perencanaan ibadah Natal", d(2026, 12, 3), t(19, 0), t(21, 0), "Ruang A", "Tidak", "Tidak"),
    ("Majelis", "Pembahasan anggaran gereja", d(2026, 12, 17), t(19, 0), t(21, 0), "Ruang A", "Tidak", "Tidak"),
    ("Pengurus Pemuda", "Pembagian tugas Natal", d(2026, 12, 12), t(14, 0), t(16, 0), "Ruang B", "Ya", "Tidak"),
    ("Tim EBM", "Persiapan ibadah khusus", d(2026, 12, 14), t(19, 0), t(20, 30), "Ruang B", "Tidak", "Tidak"),
]

# ───────────────────────── Spesifikasi sheet ─────────────────────────
# kolom: (judul, wajib, lebar, catatan, validasi, format)
# validasi: ("list", rumus, ketat) | ("int", min, max) | ("date",) | ("time",)
def LST(f_, strict=True): return ("list", f_, strict)
YT = LST('"Ya,Tidak"')
SHEETS = [
    dict(name="Pilihan", tab=GOLD, title="Pilihan — daftar isian yang dipakai sheet lain",
         note="Diisi dulu oleh Superadmin, lalu file disebar. Isi dropdown di sheet lain diambil dari sini. Satu nilai per baris, kolom boleh berbeda panjang.",
         master=True, rows=100,
         cols=[("Posisi di gereja", True, 26, "Mis. Jemaat, Pendeta, Pembina pemuda.", None, None),
               ("Kelompok CG", False, 22, "Kelompok sel / komsel.", None, None),
               ("Komunitas", False, 22, "Mis. Pemuda, Young couple, Anak-anak.", None, None),
               ("Tim pelayanan", True, 26, "Nama tim. Posisi pelayanan didaftarkan di sheet Pelayanan.", None, None)],
         data=[(POSISI[i] if i < len(POSISI) else None, CG[i] if i < len(CG) else None, KOMUNITAS[i] if i < len(KOMUNITAS) else None, TIM[i] if i < len(TIM) else None)
               for i in range(max(len(POSISI), len(CG), len(KOMUNITAS), len(TIM)))]),
    dict(name="Pelayanan", tab=GOLD, title="Pelayanan — posisi yang bisa diisi orang di dalam tim",
         note="Satu baris = satu posisi pelayanan. Pilih Tim dari dropdown (daftar tim ada di sheet Pilihan). Wajib latihan = bawaan untuk posisi ini di jadwal.",
         master=True, rows=200,
         cols=[("Tim", True, 24, "Pilih dari dropdown.", LST("=lst_tim"), None),
               ("Pelayanan", True, 26, "Mis. Gitar, Drum, LCD, Angklung.", None, None),
               ("Wajib latihan", False, 16, "Ya / Tidak. Kosong = Tidak.", YT, None)],
         data=PELAYANAN),
    dict(name="Ruangan", tab=GOLD, title="Ruangan — tempat ibadah dan latihan",
         note="Satu baris = satu ruangan. Nama ruangan tidak boleh kembar.",
         master=True, rows=50,
         cols=[("Nama ruangan", True, 28, "Mis. Ruang A, Aula, Ruang Musik.", None, None),
               ("Aktif", False, 12, "Ya / Tidak. Kosong = Ya.", YT, None)],
         data=RUANGAN),
    dict(name="Orang", tab=INDIGO, title="Orang — jemaat dan pelayan",
         note="Satu baris = satu orang. Tulis Nama tanpa gelar (gelar di kolom Gelar). Untuk beberapa Komunitas atau Pelayanan, pisahkan dengan koma. Tanggal lahir: 1990-04-12.",
         cols=[("Gelar", False, 9, "Mis. Pdt., Ps., Dr.", None, None),
               ("Nama", True, 26, "Nama lengkap tanpa gelar. Contoh: Budi Santoso.", None, None),
               ("Tanggal lahir", False, 15, "Format 1990-04-12. Dipakai untuk menghitung usia.", ("date",), "yyyy-mm-dd"),
               ("JK", True, 7, "L = laki-laki, P = perempuan.", LST('"L,P"'), None),
               ("Posisi di gereja", True, 20, "Pilih dari dropdown (sheet Pilihan).", LST("=lst_posisi"), None),
               ("Kelompok CG", False, 18, "Pilih dari dropdown (sheet Pilihan).", LST("=lst_cg"), None),
               ("Komunitas", False, 20, "Boleh lebih dari satu, pisahkan dengan koma. Contoh: Pemuda, Young couple.", LST("=lst_komunitas", False), None),
               ("Asal", False, 10, "Dalam / Luar. Kosong = Dalam.", LST('"Dalam,Luar"'), None),
               ("Gereja asal", False, 22, "Wajib bila Asal = Luar.", None, None),
               ("Pelayanan", False, 36, "Pelayanan yang bisa diisi orang ini. Boleh lebih dari satu, pisahkan dengan koma. Contoh: Drum, Gitar, LCD.", LST("=lst_pelayanan", False), None)],
         data=ORANG, examples=ORANG[:2] + [ORANG[3]]),
    dict(name="CGLeader", tab=INDIGO, title="CGLeader — leader di tiap Kelompok CG",
         note="Satu baris = satu leader. Satu CG boleh punya lebih dari satu leader: tulis CG-nya lagi di baris berikutnya dengan nama leader lain. Nama leader harus sudah ada di sheet Orang.",
         cols=[("Kelompok CG", True, 24, "Pilih dari dropdown (sheet Pilihan).", LST("=lst_cg"), None),
               ("Nama leader", True, 28, "Sama persis dengan kolom Nama di sheet Orang.", LST("=lst_orang"), None)],
         data=CGLEADER, examples=CGLEADER[:2]),
    dict(name="Akun", tab=INDIGO, title="Akun — orang yang bisa login ke aplikasi",
         note="Hanya untuk orang yang perlu login. Nama harus sama dengan di sheet Orang. Kata sandi TIDAK ditulis di sini: sistem membuat kata sandi sementara saat impor, dan orangnya wajib menggantinya saat login pertama. Superadmin dibuat manual.",
         cols=[("Nama orang", True, 26, "Sama persis dengan kolom Nama di sheet Orang.", LST("=lst_orang"), None),
               ("Email", True, 30, "Dipakai untuk login. Tidak boleh kembar.", None, None),
               ("Role", True, 18, "Tanpa role = hanya melihat jadwal.", LST('"Tanpa role,Penjadwal,Admin Tim,Petugas Absen,Pelayan"'), None),
               ("Tim yang dikelola", False, 22, "Wajib bila Role = Admin Tim.", LST("=lst_tim"), None)],
         data=AKUN, examples=AKUN[:2]),
    dict(name="TemplateAcara", tab="1B6B34", title="Template acara — pola acara berulang",
         note="Satu baris = satu template (mis. Ibadah Minggu I). Kursi/posisi tiap template diisi di sheet TemplateSlot. Pola Bulanan butuh kolom Minggu ke-.",
         cols=[("Nama template", True, 24, "Mis. Ibadah Minggu I.", None, None),
               ("Pola", True, 12, "Mingguan = tiap pekan. Bulanan = hari ke-n dalam bulan.", LST('"Mingguan,Bulanan"'), None),
               ("Hari", True, 11, "Hari berlangsungnya acara.", LST('"Minggu,Senin,Selasa,Rabu,Kamis,Jumat,Sabtu"'), None),
               ("Minggu ke-", False, 12, "Hanya untuk Bulanan: 1-4, atau 5 = yang terakhir.", ("int", 1, 5), "0"),
               ("Jam mulai", True, 11, "Format 07:00 (24 jam).", ("time",), "hh:mm"),
               ("Durasi (menit)", False, 14, "Kosong = 120.", ("int", 15, 720), "0"),
               ("Ruangan", True, 16, "Pilih dari dropdown (sheet Ruangan).", LST("=lst_ruangan"), None),
               ("Mode kehadiran", False, 16, "Jumlah saja = satu angka. Per nama = tiap orang dicatat.", LST('"Jumlah saja,Per nama"'), None),
               ("Komunitas daftar nama", False, 20, "Hanya bila Per nama: daftar nama dibatasi komunitas ini.", LST("=lst_komunitas"), None)],
         data=TPL, examples=TPL[:1] + TPL[3:]),
    dict(name="TemplateSlot", tab="1B6B34", title="TemplateSlot — posisi pelayanan di tiap template",
         note="Satu baris = satu posisi pelayanan dalam satu template. Jumlah kursi = berapa orang yang dibutuhkan untuk posisi itu: Usher 3 berarti ada 3 orang Usher di acara. Wajib latihan kosong = ikut bawaan dari sheet Pelayanan.",
         cols=[("Nama template", True, 24, "Sama dengan sheet TemplateAcara.", LST("=lst_template"), None),
               ("Pelayanan", True, 24, "Pilih dari dropdown (sheet Pelayanan).", LST("=lst_pelayanan"), None),
               ("Jumlah kursi", False, 14, "Berapa orang yang dibutuhkan untuk posisi ini di acara. Contoh: Usher 3 = tiga orang Usher (Usher 1, 2, 3). Kosong = 1.", ("int", 1, 10), "0"),
               ("Wajib latihan", False, 14, "Ya / Tidak. Kosong = ikut bawaan pelayanan.", YT, None)],
         data=[(a, b, c, e) for a, b, c, e in SLOT], examples=[SLOT[0], SLOT[11]]),
    dict(name="Acara", tab="1B6B34", title="Acara — jadwal acara yang sudah ditetapkan",
         note="Satu baris = satu acara pada satu tanggal. Judul + Tanggal dipakai untuk mencocokkan sheet Penugasan dan Latihan. Draft = belum diterbitkan.",
         cols=[("Judul", True, 24, "Mis. Ibadah Minggu I atau Ibadah Natal 2026.", None, None),
               ("Tanggal", True, 14, "Format 2026-12-06.", ("date",), "yyyy-mm-dd"),
               ("Jam mulai", True, 11, "Format 07:00.", ("time",), "hh:mm"),
               ("Jam selesai", True, 12, "Format 09:00.", ("time",), "hh:mm"),
               ("Ruangan", True, 16, "Pilih dari dropdown (sheet Ruangan).", LST("=lst_ruangan"), None),
               ("Dari template", False, 22, "Boleh kosong untuk acara khusus.", LST("=lst_template"), None),
               ("Status", False, 12, "Draft atau Terbit. Kosong = Draft.", LST('"Draft,Terbit"'), None),
               ("Mode kehadiran", False, 16, "Jumlah saja / Per nama. Kosong = ikut template.", LST('"Jumlah saja,Per nama"'), None)],
         data=ACARA, examples=[ACARA[0], ACARA[4]]),
    dict(name="Penugasan", tab="1B6B34", title="Penugasan — siapa melayani apa di tiap acara",
         note="Satu baris = satu kursi yang sudah terisi. Judul acara + Tanggal harus ada di sheet Acara. Nama orang harus ada di sheet Orang. Kursi ke- dipakai bila satu posisi punya beberapa kursi (Usher 1, 2, 3).",
         cols=[("Judul acara", True, 24, "Sama dengan sheet Acara.", None, None),
               ("Tanggal acara", True, 15, "Sama dengan sheet Acara.", ("date",), "yyyy-mm-dd"),
               ("Pelayanan", True, 22, "Pilih dari dropdown.", LST("=lst_pelayanan"), None),
               ("Kursi ke-", False, 10, "Kosong = 1.", ("int", 1, 10), "0"),
               ("Nama orang", True, 26, "Pilih dari dropdown (sheet Orang).", LST("=lst_orang"), None)],
         data=PENUGASAN, examples=PENUGASAN[:2]),
    dict(name="Latihan", tab="1B6B34", title="Latihan — sesi latihan untuk sebuah acara",
         note="Satu baris = satu sesi latihan. Latihan ke-1, 2, dst. dihitung otomatis menurut urutan tanggal. Pesertanya otomatis semua orang yang wajib latihan di acara itu.",
         cols=[("Judul acara", True, 24, "Sama dengan sheet Acara.", None, None),
               ("Tanggal acara", True, 15, "Sama dengan sheet Acara.", ("date",), "yyyy-mm-dd"),
               ("Tanggal latihan", True, 15, "Format 2026-12-03.", ("date",), "yyyy-mm-dd"),
               ("Jam mulai", True, 11, "Format 19:30.", ("time",), "hh:mm"),
               ("Durasi (menit)", True, 14, "Mis. 90.", ("int", 15, 720), "0"),
               ("Ruangan", True, 16, "Pilih dari dropdown.", LST("=lst_ruangan"), None),
               ("Catatan", False, 30, "Boleh kosong.", None, None)],
         data=LATIHAN, examples=LATIHAN[:1]),
    dict(name="KelompokRapat", tab="C0562D", title="KelompokRapat — kelompok yang mengadakan rapat",
         note="Satu baris = satu kelompok (mis. Majelis, Pengurus Pemuda). Setiap kelompok otomatis punya jabatan Anggota. Jabatan lain diisi di sheet JabatanKelompok, anggotanya di sheet AnggotaKelompok. Kelompok yang sudah ada di sistem dilewati.",
         cols=[("Nama kelompok", True, 28, "Mis. Majelis, Pengurus Pemuda. Tidak boleh kembar.", None, None),
               ("Kuorum (%)", False, 14, "Persen anggota yang harus hadir supaya rapat sah, 1-100. Kosong = tanpa kuorum.", ("int", 1, 100), "0")],
         data=KELOMPOK, examples=[KELOMPOK[0]]),
    dict(name="JabatanKelompok", tab="C0562D", title="JabatanKelompok — jabatan di tiap kelompok dan haknya",
         note="Satu baris = satu jabatan. Hak diisi Ya atau Tidak (kosong = Tidak). Orang yang merangkap beberapa jabatan mendapat gabungan hak. Jabatan Anggota otomatis ada di setiap kelompok, tidak perlu ditulis. Jabatan yang sudah ada di sistem dilewati (haknya tidak diubah).",
         cols=[("Kelompok", True, 24, "Sama dengan sheet KelompokRapat (atau kelompok yang sudah ada).", LST("=lst_kelompok", False), None),
               ("Jabatan", True, 22, "Mis. Ketua, Sekretaris, Bendahara, Penjadwal.", None, None),
               ("Boleh menjadwalkan rapat", False, 22, "Membuat dan mengubah rapat kelompok dan meminjam ruangan.", YT, None),
               ("Boleh menulis notulen", False, 22, "Menulis dan menyimpan draf notulen.", YT, None),
               ("Boleh memfinalkan notulen", False, 22, "Memfinalkan notulen dan membuat revisi.", YT, None),
               ("Boleh mengatur anggota", False, 22, "Menambah dan mengeluarkan anggota, mengatur jabatan.", YT, None)],
         data=JABATAN, examples=[JABATAN[0], JABATAN[1]]),
    dict(name="AnggotaKelompok", tab="C0562D", title="AnggotaKelompok — siapa saja anggota tiap kelompok",
         note="Satu baris = satu orang di satu kelompok. Nama harus sudah ada di sheet Orang. Jabatan boleh lebih dari satu (pisahkan koma); kosong = Anggota. Yang sudah anggota dilewati. Isi rapat dan notulen hanya terbaca anggota kelompok, bukan Superadmin.",
         cols=[("Kelompok", True, 24, "Sama dengan sheet KelompokRapat (atau kelompok yang sudah ada).", LST("=lst_kelompok", False), None),
               ("Nama orang", True, 28, "Sama persis dengan kolom Nama di sheet Orang.", LST("=lst_orang"), None),
               ("Jabatan", False, 30, "Jabatan dari sheet JabatanKelompok. Boleh lebih dari satu, pisahkan koma. Kosong = Anggota.", None, None)],
         data=ANGGOTA, examples=[ANGGOTA[0], ANGGOTA[3]]),
    dict(name="Rapat", tab="C0562D", title="Rapat — jadwal rapat kelompok",
         note="Satu baris = satu rapat pada satu tanggal. Seluruh anggota kelompok otomatis diundang. Nama peserta tertentu, tamu, dan tautan lampiran sengaja tidak ada di sini: itu isi rapat dan hanya bisa diatur oleh anggota kelompok lewat aplikasi. Rapat berulang juga dibuat di aplikasi; di sini tulis tiap tanggalnya. Ruangan yang bentrok ditolak.",
         cols=[("Kelompok", True, 24, "Sama dengan sheet KelompokRapat (atau kelompok yang sudah ada).", LST("=lst_kelompok", False), None),
               ("Judul atau topik", True, 32, "Mis. Evaluasi pelayanan Oktober.", None, None),
               ("Tanggal", True, 14, "Format 2026-12-08.", ("date",), "yyyy-mm-dd"),
               ("Jam mulai", True, 11, "Format 19:00 (24 jam).", ("time",), "hh:mm"),
               ("Jam selesai", True, 12, "Format 21:00. Paling lama 12 jam.", ("time",), "hh:mm"),
               ("Ruangan", True, 16, "Pilih dari dropdown (sheet Ruangan).", LST("=lst_ruangan"), None),
               ("Judul tampil di kalender umum", False, 22, "Ya = judul rapat terlihat di kalender semua orang. Kosong = Tidak.", YT, None),
               ("Peserta tampil di kalender umum", False, 22, "Ya = daftar peserta ikut terlihat di kalender umum. Kosong = Tidak.", YT, None)],
         data=RAPAT, examples=[RAPAT[0]]),
]
# sheet sumber nama untuk dropdown: nama → (sheet, kolom, baris awal, baris akhir)
NAMES = {
    "lst_posisi": ("Pilihan", "A", 103), "lst_cg": ("Pilihan", "B", 103), "lst_komunitas": ("Pilihan", "C", 103), "lst_tim": ("Pilihan", "D", 103),
    "lst_pelayanan": ("Pelayanan", "B", 203), "lst_ruangan": ("Ruangan", "A", 53),
    "lst_orang": ("Orang", "C", 503), "lst_template": ("TemplateAcara", "B", 503),
    "lst_kelompok": ("KelompokRapat", "B", 503),
}
# pembagian kerja di sheet Petunjuk
PLAN = [
    ("Pilihan", "Posisi di gereja, kelompok CG, komunitas, daftar tim", 1, "Ya"),
    ("Pelayanan", "Posisi pelayanan per tim (Gitar, Drum, LCD, …)", 2, "Ya"),
    ("Ruangan", "Daftar ruangan", 3, "Ya"),
    ("Orang", "Jemaat dan pelayan beserta kemampuan pelayanannya", 4, "Ya"),
    ("CGLeader", "Leader tiap Kelompok CG (satu CG boleh banyak leader)", 5, "Tidak"),
    ("Akun", "Siapa yang bisa login, email, dan role", 6, "Tidak"),
    ("TemplateAcara", "Pola acara berulang (Ibadah Minggu, Fellowship, …)", 7, "Tidak"),
    ("TemplateSlot", "Posisi pelayanan dan jumlah kursi di tiap template", 8, "Tidak"),
    ("Acara", "Acara yang sudah punya tanggal", 9, "Tidak"),
    ("Penugasan", "Siapa melayani apa di tiap acara", 10, "Tidak"),
    ("Latihan", "Sesi latihan tiap acara", 11, "Tidak"),
    ("KelompokRapat", "Kelompok yang mengadakan rapat (Majelis, Pengurus Pemuda, …)", 12, "Tidak"),
    ("JabatanKelompok", "Jabatan di tiap kelompok dan haknya", 13, "Tidak"),
    ("AnggotaKelompok", "Anggota dan jabatannya di tiap kelompok", 14, "Tidak"),
    ("Rapat", "Jadwal rapat kelompok (seluruh anggota diundang)", 15, "Tidak"),
]
COUNT = {  # rumus jumlah baris terisi
    "Pilihan": "=COUNTA(Pilihan!A4:A103)", "Pelayanan": "=COUNTA(Pelayanan!B4:B203)", "Ruangan": "=COUNTA(Ruangan!A4:A53)",
    "Orang": '=COUNTA(Orang!C4:C503)-COUNTIF(Orang!A4:A503,"contoh")', "CGLeader": '=COUNTA(CGLeader!B4:B503)-COUNTIF(CGLeader!A4:A503,"contoh")', "Akun": '=COUNTA(Akun!B4:B503)-COUNTIF(Akun!A4:A503,"contoh")',
    "TemplateAcara": '=COUNTA(TemplateAcara!B4:B503)-COUNTIF(TemplateAcara!A4:A503,"contoh")',
    "TemplateSlot": '=COUNTA(TemplateSlot!B4:B503)-COUNTIF(TemplateSlot!A4:A503,"contoh")',
    "Acara": '=COUNTA(Acara!B4:B503)-COUNTIF(Acara!A4:A503,"contoh")',
    "Penugasan": '=COUNTA(Penugasan!B4:B503)-COUNTIF(Penugasan!A4:A503,"contoh")',
    "Latihan": '=COUNTA(Latihan!B4:B503)-COUNTIF(Latihan!A4:A503,"contoh")',
    "KelompokRapat": '=COUNTA(KelompokRapat!B4:B503)-COUNTIF(KelompokRapat!A4:A503,"contoh")',
    "JabatanKelompok": '=COUNTA(JabatanKelompok!B4:B503)-COUNTIF(JabatanKelompok!A4:A503,"contoh")',
    "AnggotaKelompok": '=COUNTA(AnggotaKelompok!B4:B503)-COUNTIF(AnggotaKelompok!A4:A503,"contoh")',
    "Rapat": '=COUNTA(Rapat!B4:B503)-COUNTIF(Rapat!A4:A503,"contoh")',
}

def make_dv(spec):
    kind = spec[0]
    if kind == "list":
        dv = DataValidation(type="list", formula1=spec[1], allow_blank=True)
        dv.showErrorMessage = bool(spec[2])
        dv.errorTitle, dv.error = "Pilihan tidak dikenal", "Pilih salah satu dari daftar."
        if spec[1].startswith("=lst_") and not spec[2]:
            dv.showInputMessage, dv.promptTitle, dv.prompt = True, "Boleh lebih dari satu", "Pilih dari daftar atau ketik beberapa nilai dipisah koma."
        return dv
    if kind == "int":
        dv = DataValidation(type="whole", operator="between", formula1=str(spec[1]), formula2=str(spec[2]), allow_blank=True)
        dv.errorTitle, dv.error = "Angka tidak valid", f"Isi angka bulat {spec[1]} sampai {spec[2]}."
    elif kind == "date":
        dv = DataValidation(type="date", operator="between", formula1="36526", formula2="73415", allow_blank=True)  # 2000-01-01 … 2100-12-31
        dv.errorTitle, dv.error = "Tanggal tidak valid", "Isi tanggal, contoh 2026-12-06."
    else:
        dv = DataValidation(type="time", operator="between", formula1="0", formula2="0.999988", allow_blank=True)
        dv.errorTitle, dv.error = "Jam tidak valid", "Isi jam dengan format 07:00 (24 jam)."
    dv.showErrorMessage = True
    return dv

def build(path, filled):
    wb = Workbook()
    ws0 = wb.active
    ws0.title = "Petunjuk"
    for n, (sh, col, last) in NAMES.items():
        wb.defined_names[n] = DefinedName(n, attr_text=f"{sh}!${col}$4:${col}${last}")

    for s in SHEETS:
        ws = wb.create_sheet(s["name"])
        ws.sheet_properties.tabColor = s["tab"]
        ncol = len(s["cols"])
        master = s.get("master", False)
        has_no = not master
        first = 2 if has_no else 1            # kolom pertama untuk isian
        last = ncol + (1 if has_no else 0)
        # judul dan petunjuk
        ws["A1"] = s["title"]; ws["A1"].font = f(size=14, bold=True, color=INDIGO)
        ws.row_dimensions[1].height = 26
        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max(last, 6))
        ws["A2"] = s["note"]; ws["A2"].font = f(color=INK); ws["A2"].alignment = Alignment(wrap_text=True, vertical="top")
        ws["A2"].fill = PatternFill("solid", fgColor=GOLD_SOFT)
        ws.row_dimensions[2].height = 44
        # header
        if has_no:
            h = ws.cell(HDR, 1, "No"); h.font = f(bold=True, color="FFFFFF"); h.fill = PatternFill("solid", fgColor=GRAY)
            h.alignment = Alignment(horizontal="center", vertical="center"); h.border = BORDER
            ws.column_dimensions["A"].width = 8
        for i, (name, req, width, note, _, _) in enumerate(s["cols"]):
            c = ws.cell(HDR, first + i, name + (" *" if req else ""))
            c.font = f(bold=True, color="FFFFFF" if req else INDIGO)
            c.fill = PatternFill("solid", fgColor=INDIGO if req else INDIGO_SOFT)
            c.alignment = Alignment(wrap_text=True, vertical="center", horizontal="left"); c.border = BORDER
            cm = Comment(note + (" (Wajib diisi)" if req else " (Boleh kosong)"), "Template"); cm.width, cm.height = 260, 80
            c.comment = cm
            ws.column_dimensions[L(first + i)].width = width
        ws.row_dimensions[HDR].height = 32
        ws.freeze_panes = ws.cell(DATA0, 1)

        # isi data
        rows_total = s.get("rows", ROWS)
        ex = [] if (filled or master) else s.get("examples", [])
        body = s["data"] if (filled or master) else []
        data_rows = [(r, "contoh") for r in ex] + [(r, None) for r in body]
        for ri in range(rows_total):
            r = DATA0 + ri
            tag, row = None, None
            if ri < len(data_rows):
                row, tag = data_rows[ri]
            is_ex = tag == "contoh"
            if has_no:
                nc = ws.cell(r, 1)
                if is_ex: nc.value = "contoh"
                else: nc.value = ri - len(ex) + 1
                nc.font = f(color=GRAY, italic=is_ex); nc.alignment = Alignment(horizontal="center"); nc.border = BORDER
                if is_ex: nc.fill = PatternFill("solid", fgColor="F2F2F2")
            for i in range(ncol):
                c = ws.cell(r, first + i)
                if row is not None and row[i] is not None: c.value = row[i]
                c.font = f(color=GRAY if is_ex else INK, italic=is_ex)
                c.border = BORDER
                fmt = s["cols"][i][5]
                if fmt: c.number_format = fmt
                if is_ex: c.fill = PatternFill("solid", fgColor="F2F2F2")
                c.alignment = Alignment(vertical="center", horizontal="left")
        # validasi data
        for i, col in enumerate(s["cols"]):
            if col[4] is None: continue
            dv = make_dv(col[4]); ws.add_data_validation(dv)
            colL = L(first + i)
            dv.add(f"{colL}{DATA0}:{colL}{DATA0 + rows_total - 1}")

    # Petunjuk
    ws = ws0
    ws.sheet_properties.tabColor = "000000"
    for col, w in zip("ABCDEF", (18, 54, 24, 12, 13, 14)): ws.column_dimensions[col].width = w
    ws["A1"] = "Template impor data — Aplikasi Penjadwalan Gereja"; ws["A1"].font = f(size=16, bold=True, color=INDIGO)
    ws["A2"] = "Isi sheet bagian Anda saja, lalu kirim file ini kembali ke Superadmin."; ws["A2"].font = f(size=11, color=INK)
    r = 4
    def section(title):
        nonlocal r
        ws.cell(r, 1, title).font = f(size=11, bold=True, color=GOLD)
        for c in range(1, 7): ws.cell(r, c).border = Border(bottom=Side(style="medium", color=GOLD))
        r += 1
    def line(text, bold=False):
        nonlocal r
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=6)
        c = ws.cell(r, 1, text); c.font = f(bold=bold, color=INK); c.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[r].height = 15 * (1 + len(text) // 105)
        r += 1
    section("Cara pakai")
    for x in [
        "1. Superadmin mengisi dulu sheet Pilihan, Pelayanan, dan Ruangan. Daftar di sana menjadi isi dropdown sheet lain, jadi isi dulu sebelum file disebar.",
        "2. Sebar file ini. Tiap pengisi hanya mengerjakan sheet bagiannya (lihat tabel di bawah). Sheet lain biarkan.",
        "3. Jangan mengganti nama sheet, nama kolom, atau urutan kolom, dan jangan menambah atau menghapus kolom. Isi mulai dari baris di bawah judul kolom.",
        "4. Pengisi mengirim file kembali ke Superadmin. Tidak perlu digabung: Superadmin mengunggah satu per satu, dan sistem hanya membaca sheet yang ada isinya.",
        "5. Sebelum disimpan ke database, sistem menampilkan pratinjau: baris yang sah, dan baris yang salah beserta alasannya. Superadmin baru menekan Simpan.",
    ]: line(x)
    r += 1
    section("Pembagian sheet (urutan impor dari atas ke bawah)")
    for i, hname in enumerate(["Sheet", "Isi", "Dikerjakan oleh", "Urutan impor", "Wajib?", "Baris terisi"]):
        c = ws.cell(r, 1 + i, hname); c.font = f(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor=INDIGO); c.border = BORDER
        c.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
    r += 1
    for sh, isi, urut, wajib in PLAN:
        vals = [sh, isi, None, urut, wajib, COUNT[sh]]
        for i, v in enumerate(vals):
            c = ws.cell(r, 1 + i, v); c.border = BORDER; c.font = f(bold=(i == 0), color=INK)
            c.alignment = Alignment(vertical="center", wrap_text=True, horizontal="center" if i >= 3 else "left")
            if i == 2: c.fill = PatternFill("solid", fgColor="FFFF99")
            if i == 5: c.number_format = "0"
        ws.cell(r, 1).hyperlink = f"#'{sh}'!A1"; ws.cell(r, 1).font = f(bold=True, color=INDIGO, underline="single")
        ws.row_dimensions[r].height = 22
        r += 1
    ws.cell(r, 1, "Kolom kuning diisi Superadmin: nama orang yang mengerjakan tiap sheet (mis. A, B). Baris terisi dihitung otomatis dari sheet masing-masing.").font = f(size=9, color=GRAY, italic=True)
    r += 2
    section("Aturan penulisan")
    for x in [
        "• Kolom bertanda * wajib diisi. Judul kolom biru tua = wajib, biru muda = boleh kosong. Arahkan kursor ke judul kolom untuk melihat penjelasan dan contoh.",
        "• Tanggal ditulis 2026-12-06 (tahun-bulan-tanggal). Jam ditulis 07:00 (24 jam).",
        "• Beberapa nilai dalam satu sel (Komunitas, Pelayanan di sheet Orang) dipisahkan koma. Contoh: Drum, Gitar, LCD.",
        "• Nama (orang, ruangan, pelayanan, template) harus sama dengan yang ada di sheet sumbernya. Gunakan dropdown agar tidak salah ketik. Huruf besar-kecil tidak dipermasalahkan.",
        "• Baris abu-abu bertanda \"contoh\" hanya contoh pengisian: boleh dihapus atau dibiarkan, sistem melewatinya. Baris kosong juga dilewati.",
        "• Kata sandi tidak pernah ditulis di Excel. Sistem membuat kata sandi sementara saat impor akun, dan orangnya wajib menggantinya saat login pertama.",
        "• Nama kembar: orang dengan nama yang sama dianggap orang yang sama dan dilewati. Bedakan dengan nama lengkap bila memang dua orang berbeda.",
        "• Rapat kelompok: isi KelompokRapat dulu, lalu JabatanKelompok, AnggotaKelompok, dan terakhir Rapat. Seluruh anggota kelompok otomatis diundang. Peserta tertentu, tamu, dan tautan lampiran tidak diimpor karena itu isi rapat yang hanya boleh diatur anggota kelompok lewat aplikasi.",
        "• Data yang sudah ada di sistem (kelompok, jabatan, anggota, rapat dengan kelompok, judul, dan tanggal yang sama) dilewati, tidak ditimpa. File boleh diunggah berulang kali.",
    ]: line(x)
    r += 1
    section("Arti warna")
    for fill, fc, text in [(INDIGO, "FFFFFF", "Judul kolom wajib"), (INDIGO_SOFT, INDIGO, "Judul kolom boleh kosong"), ("F2F2F2", GRAY, "Baris contoh (dilewati saat impor)"), ("FFFF99", INK, "Diisi Superadmin"), (GOLD_SOFT, INK, "Petunjuk di tiap sheet")]:
        c = ws.cell(r, 1, text); c.fill = PatternFill("solid", fgColor=fill); c.font = f(color=fc, italic=(fill == "F2F2F2")); c.border = BORDER
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2)
        r += 1
    ws.sheet_view.showGridLines = False
    ws.freeze_panes = "A4"
    for w in wb.worksheets: w.sheet_view.zoomScale = 100
    wb.save(path)

if __name__ == "__main__":
    build(sys.argv[1], filled=(sys.argv[2] == "filled"))
