/** Jenis notifikasi dan untuk siapa. Aman dipakai di sisi browser (tanpa impor server). */
export type Audience = "SEMUA" | "PELAYAN" | "PENJADWAL" | "PENGELOLA" | "KELOMPOK";

export const NOTIF_KINDS = [
  { kind: "ULANG_TAHUN", audience: "SEMUA", label: "Ulang tahun jemaat", hint: "Pagi hari ketika ada jemaat yang berulang tahun. Satu pesan gabungan bila lebih dari satu orang; ulang tahun Anda sendiri tidak diberitahukan ke Anda." },
  { kind: "PELAYAN_DIBERITAHU", audience: "PELAYAN", label: "Pemberitahuan jadwal dari Penjadwal", hint: "Saat Penjadwal menekan tombol beri tahu pelayan pada acara yang sudah terbit." },
  { kind: "PELAYAN_BATAL", audience: "PELAYAN", label: "Jadwal dibatalkan atau diganti", hint: "Saat acara terbit tempat Anda bertugas dibatalkan, atau tugas Anda dialihkan atau ditambahkan karena penggantian." },
  { kind: "PELAYAN_H1", audience: "PELAYAN", label: "Pengingat sehari sebelumnya", hint: "Satu pesan gabungan sore sebelum acara atau latihan. Tidak ada pengingat di hari tanpa jadwal." },
  { kind: "PELAYAN_BULANAN", audience: "PELAYAN", label: "Ringkasan jadwal tiap awal bulan", hint: "Tanggal 1: semua acara, posisi, latihan, dan rapat Anda bulan itu. Tidak dikirim bila tidak ada." },
  { kind: "PENJADWAL_KEHADIRAN", audience: "PENJADWAL", label: "Kehadiran belum diisi", hint: "Sekali setelah acara selesai, dan sekali lagi paling lama 3 hari kemudian." },
  { kind: "PENJADWAL_ATURAN", audience: "PENJADWAL", label: "Pelanggaran aturan baru", hint: "Hanya bila ada pelanggaran baru, maksimal sekali sehari." },
  { kind: "ONLINE_H1", audience: "SEMUA", label: "Pengingat ibadah online", hint: "Sore sebelum ibadah online yang tautannya untuk Anda (semua orang atau komunitas Anda). Penjadwal bisa mematikannya per acara. Tidak berisi tautan; buka di aplikasi." },
  { kind: "TUKAR_MASUK", audience: "PENGELOLA", label: "Permintaan pengganti baru", hint: "Saat seorang pelayan meminta kursinya digantikan di tim Anda. Satu pesan per permintaan." },
  { kind: "TUKAR_DITOLAK", audience: "PELAYAN", label: "Permintaan pengganti ditolak", hint: "Saat permintaan pengganti Anda ditolak. Bila disetujui, Anda menerima pemberitahuan jadwal diganti seperti biasa." },
  { kind: "KELOMPOK_H1", audience: "KELOMPOK", label: "Pengingat rapat kelompok", hint: "Sehari sebelum rapat atau acara kelompok Anda." },
] as const;

export type NotifKind = (typeof NOTIF_KINDS)[number]["kind"];
export const AUDIENCE_LABEL: Record<Audience, string> = { SEMUA: "Untuk semua", PELAYAN: "Sebagai pelayan", PENJADWAL: "Sebagai penjadwal", PENGELOLA: "Sebagai pengelola jadwal (Penjadwal dan Admin Tim)", KELOMPOK: "Sebagai anggota kelompok" };

const KINDS = new Set<string>(NOTIF_KINDS.map((k) => k.kind));
export const isNotifKind = (v: string): v is NotifKind => KINDS.has(v);
export const kindsFor = (audiences: Audience[]) => NOTIF_KINDS.filter((k) => audiences.includes(k.audience));
