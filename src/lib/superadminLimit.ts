/** Batas jumlah akun Superadmin yang aktif. Murni (tanpa database) supaya mudah diuji. */
export const MAX_SUPERADMINS = 2;

export const SUPERADMIN_FULL_MESSAGE = `Superadmin dibatasi maksimal ${MAX_SUPERADMINS} akun aktif. Cabut role Superadmin atau nonaktifkan salah satu akun Superadmin yang ada dulu.`;

/**
 * Perlu satu "kursi" Superadmin? Ya bila akun ini tadinya tidak dihitung (bukan Superadmin, atau nonaktif) dan sesudah perubahan
 * menjadi Superadmin yang aktif: akun baru, role Superadmin diberikan, atau akun Superadmin yang nonaktif diaktifkan kembali.
 */
export function needsSuperadminSlot(before: { isSuper: boolean; active: boolean } | null, after: { isSuper: boolean; active: boolean }): boolean {
  const was = !!before && before.isSuper && before.active;
  return after.isSuper && after.active && !was;
}

export const superadminSlotFull = (activeOthers: number) => activeOthers >= MAX_SUPERADMINS;
