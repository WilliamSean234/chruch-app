/**
 * Aturan kelompok rapat yang murni (tanpa database, supaya mudah diuji).
 */

/** Jabatan wajib di setiap kelompok: akses penuh atas kelompoknya. Tidak bisa diubah namanya, haknya, atau dihapus. */
export const ADMIN_TIM_POSITION = "Pengelola Kelompok"; // sebelumnya "Admin Tim"; diganti supaya tidak tertukar dengan role Admin Tim (pengelola satu tim pelayanan)
export const ADMIN_TIM_CAPS = { canSchedule: true, canWriteMinutes: true, canFinalize: true, canManageMembers: true } as const;
/** Nama jabatan lama yang dinaikkan menjadi Pengelola Kelompok: "Admin Tim" (nama sebelum diganti), serta "Admin Tim EBM" dan "Penjadwal EBM" (kelompok EBM). */
export const ADMIN_TIM_LEGACY_NAMES = ["Admin Tim", "Admin Tim EBM", "Penjadwal EBM"] as const;
/** Nama yang sama dengan jabatan wajib; nama lamanya ("Admin Tim") ikut dikenali supaya file Excel lama tetap terbaca. */
export const isAdminTimName = (name: string) => { const n = name.trim().replace(/\s+/g, " ").toLowerCase(); return n === ADMIN_TIM_POSITION.toLowerCase() || n === "admin tim"; };

/**
 * Siapa boleh mengubah anggota kelompok: menambah, mengeluarkan, dan mengubah jabatan anggota.
 * Anggota yang jabatannya berhak "kelola anggota" (Pengelola Kelompok selalu berhak). Superadmin hanya selama kelompok belum punya
 * Pengelola Kelompok: ia memasukkan Pengelola Kelompok pertama, dan sesudah itu kelompok diurus Pengelola Kelompok. Superadmin tetap mengatur struktur
 * (nama, kuorum, jabatan), tetapi tidak membaca isi rapat.
 */
export function canEditGroupMembers(o: { isManagerMember: boolean; isSuperadmin: boolean; groupHasAdminTim: boolean }): boolean {
  if (o.isManagerMember) return true;
  return o.isSuperadmin && !o.groupHasAdminTim;
}

/**
 * Siapa boleh membuat, mengubah, dan menghapus jabatan di satu kelompok. Pemegang jabatan Pengelola Kelompok itu; Superadmin hanya
 * selama kelompok belum punya Pengelola Kelompok (ia menyiapkan jabatan sebelum menyerahkan kelompok ke Pengelola Kelompok).
 */
export function canManageGroupPositions(o: { isAdminTimMember: boolean; isSuperadmin: boolean; groupHasAdminTim: boolean }): boolean {
  if (o.isAdminTimMember) return true;
  return o.isSuperadmin && !o.groupHasAdminTim;
}

/**
 * Jabatan dengan hak khusus: Pengelola Kelompok, atau jabatan yang boleh menjadwalkan rapat, menulis atau memfinalkan notulen, atau mengelola anggota.
 * Memberi atau mencabutnya tidak boleh dilakukan hanya karena punya hak "kelola anggota": pengelola anggota bisa menaikkan dirinya sendiri
 * menjadi Pengelola Kelompok atau penulis notulen, atau mencopot pemegang hak yang sebenarnya. Hanya Pengelola Kelompok itu (atau Superadmin selama belum ada Pengelola Kelompok).
 */
export function isElevatedPosition(p: { name: string; canSchedule: boolean; canWriteMinutes: boolean; canFinalize: boolean; canManageMembers: boolean }): boolean {
  return isAdminTimName(p.name) || p.canSchedule || p.canWriteMinutes || p.canFinalize || p.canManageMembers;
}

/** Apakah perubahan jabatan seorang anggota (dari `before` menjadi `after`) memberi atau mencabut satu jabatan berhak khusus? */
export function elevatedChanged(elevatedIds: string[], before: string[], after: string[]): boolean {
  const elevated = new Set(elevatedIds);
  const a = new Set(before.filter((id) => elevated.has(id)));
  const b = new Set(after.filter((id) => elevated.has(id)));
  return a.size !== b.size || [...a].some((id) => !b.has(id));
}
