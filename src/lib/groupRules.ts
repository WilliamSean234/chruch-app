/**
 * Siapa boleh mengubah anggota kelompok: menambah, mengeluarkan, dan mengubah jabatan anggota (murni, tanpa database, supaya mudah diuji).
 * Anggota yang jabatannya berhak "kelola anggota", dan Superadmin di kelompok mana pun.
 * Hak Superadmin hanya soal keanggotaan: menjadwalkan rapat dan menulis atau memfinalkan notulen tetap hanya lewat jabatan.
 */
export function canEditGroupMembers(o: { isManagerMember: boolean; isSuperadmin: boolean }): boolean {
  return o.isManagerMember || o.isSuperadmin;
}
