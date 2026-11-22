import type { AuthUser } from "./rbac";

/**
 * Setiap orang yang sudah masuk boleh MELIHAT pemakaian dan ketersediaan ruangan (hanya baca).
 * Membuat jadwal tetap dibatasi: ibadah oleh Penjadwal (anggota TKI), rapat oleh anggota kelompok yang jabatannya
 * berhak menjadwalkan. Mengubah data ruangan tetap `master.write`. Judul rapat disamarkan bagi yang bukan anggota (roomUsage).
 */
export async function canViewRooms(_u: AuthUser): Promise<boolean> {
  return true;
}

/** Dipertahankan agar semua pintu masuk ruangan tetap lewat satu tempat bila aturan lihat berubah lagi. */
export async function requireRoomView(u: AuthUser): Promise<void> {
  await canViewRooms(u);
}
