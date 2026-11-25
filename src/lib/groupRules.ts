/**
 * Siapa boleh mengubah anggota kelompok (murni, tanpa database, supaya mudah diuji).
 * Hanya anggota yang jabatannya berhak "kelola anggota". Superadmin tidak otomatis boleh; pengecualiannya hanya bila kelompok
 * belum punya satu pun anggota berhak itu, supaya kelompok baru atau kelompok yang kehilangan pengelolanya tidak macet.
 */
export function canEditGroupMembers(o: { isManagerMember: boolean; isSuperadmin: boolean; groupHasManager: boolean }): boolean {
  if (o.isManagerMember) return true;
  return o.isSuperadmin && !o.groupHasManager;
}
