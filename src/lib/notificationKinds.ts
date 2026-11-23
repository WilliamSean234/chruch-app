/** Jenis notifikasi dan untuk siapa. Aman dipakai di sisi browser (tanpa impor server). */
export type Audience = "PELAYAN" | "PENJADWAL" | "KELOMPOK";

export const NOTIF_KINDS = [
  { kind: "PELAYAN_DIBERITAHU", audience: "PELAYAN", label: "Pemberitahuan jadwal dari Penjadwal", hint: "Saat Penjadwal menekan tombol beri tahu pelayan pada acara yang sudah terbit." },
  { kind: "PELAYAN_BATAL", audience: "PELAYAN", label: "Jadwal dibatalkan atau diganti", hint: "Saat acara tempat Anda bertugas dibatalkan, atau tugas Anda dialihkan." },
  { kind: "PELAYAN_H1", audience: "PELAYAN", label: "Pengingat sehari sebelumnya", hint: "Satu pesan gabungan sore sebelum acara atau latihan. Tidak ada pengingat di hari tanpa jadwal." },
  { kind: "PELAYAN_BULANAN", audience: "PELAYAN", label: "Ringkasan jadwal tiap awal bulan", hint: "Tanggal 1: semua acara, posisi, latihan, dan rapat Anda bulan itu. Tidak dikirim bila tidak ada." },
  { kind: "PENJADWAL_KEHADIRAN", audience: "PENJADWAL", label: "Kehadiran belum diisi", hint: "Sekali setelah acara selesai, dan sekali lagi paling lama 3 hari kemudian." },
  { kind: "PENJADWAL_ATURAN", audience: "PENJADWAL", label: "Pelanggaran aturan baru", hint: "Hanya bila ada pelanggaran baru, maksimal sekali sehari." },
  { kind: "KELOMPOK_H1", audience: "KELOMPOK", label: "Pengingat rapat kelompok", hint: "Sehari sebelum rapat atau acara kelompok Anda." },
] as const;

export type NotifKind = (typeof NOTIF_KINDS)[number]["kind"];
export const AUDIENCE_LABEL: Record<Audience, string> = { PELAYAN: "Sebagai pelayan", PENJADWAL: "Sebagai penjadwal", KELOMPOK: "Sebagai anggota kelompok" };

const KINDS = new Set<string>(NOTIF_KINDS.map((k) => k.kind));
export const isNotifKind = (v: string): v is NotifKind => KINDS.has(v);
export const kindsFor = (audiences: Audience[]) => NOTIF_KINDS.filter((k) => audiences.includes(k.audience));
