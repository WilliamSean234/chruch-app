/**
 * Aturan kelompok rapat yang murni (tanpa database, supaya mudah diuji).
 */

/** Jabatan wajib di setiap kelompok: akses penuh atas kelompoknya. Tidak bisa diubah namanya, haknya, atau dihapus. */
export const ADMIN_TIM_POSITION = "Admin Tim";
export const ADMIN_TIM_CAPS = { canSchedule: true, canWriteMinutes: true, canFinalize: true, canManageMembers: true } as const;
/** Nama jabatan lama yang dinaikkan menjadi Admin Tim (kelompok EBM). */
export const ADMIN_TIM_LEGACY_NAMES = ["Admin Tim EBM", "Penjadwal EBM"] as const;
export const isAdminTimName = (name: string) => name.trim().toLowerCase() === ADMIN_TIM_POSITION.toLowerCase();

/**
 * Siapa boleh mengubah anggota kelompok: menambah, mengeluarkan, dan mengubah jabatan anggota.
 * Anggota yang jabatannya berhak "kelola anggota" (Admin Tim selalu berhak). Superadmin hanya selama kelompok belum punya
 * Admin Tim: ia memasukkan Admin Tim pertama, dan sesudah itu kelompok diurus Admin Tim. Superadmin tetap mengatur struktur
 * (nama, kuorum, jabatan), tetapi tidak membaca isi rapat.
 */
export function canEditGroupMembers(o: { isManagerMember: boolean; isSuperadmin: boolean; groupHasAdminTim: boolean }): boolean {
  if (o.isManagerMember) return true;
  return o.isSuperadmin && !o.groupHasAdminTim;
}
