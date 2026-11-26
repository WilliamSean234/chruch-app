import { blockedByOwner, OWNER_MESSAGE } from "./ownerRules";
import { MAX_SUPERADMINS } from "./superadminLimit";

/** Role yang kursinya bisa diatur Superadmin utama. Superadmin dikunci di kode (MAX_SUPERADMINS); Pelayan dan Petugas Absen jumlahnya banyak, jadi tanpa batas. */
export const LIMITABLE_ROLES = ["PENJADWAL", "ADMIN_TIM", "ADMIN_JEMAAT", "PENGAWAS"] as const;
export const SEAT_MAX = 500;
const limitable = (code: string) => (LIMITABLE_ROLES as readonly string[]).includes(code);

/** Batas yang berlaku untuk satu role: Superadmin selalu MAX_SUPERADMINS, role yang bisa dibatasi memakai nilai tersimpan, sisanya tanpa batas. */
export function effectiveLimit(code: string, stored: number | null | undefined): number | null {
  if (code === "SUPERADMIN") return MAX_SUPERADMINS;
  return limitable(code) ? stored ?? null : null;
}
/** Penuh: ada batas dan sudah terpakai semua. */
export const seatsFull = (max: number | null, activeCount: number): boolean => max !== null && activeCount >= max;

/**
 * Role yang butuh satu kursi baru dari perubahan ini: role yang tadinya tidak dihitung (belum dipegang, atau akunnya nonaktif)
 * dan sesudah perubahan dipegang akun yang aktif. Mencakup akun baru, role yang diberikan, dan akun nonaktif yang diaktifkan lagi.
 */
export function rolesNeedingSlot(before: { codes: string[]; active: boolean } | null, after: { codes: string[]; active: boolean }): string[] {
  if (!after.active) return [];
  return after.codes.filter((c) => !(before && before.active && before.codes.includes(c)));
}

/** Periksa pengaturan batas yang diajukan. `counts` = akun aktif pemegang tiap role. Mengembalikan pesan penolakan, atau null. */
export function validateLimits(limits: Record<string, number | null>, counts: Record<string, number>): string | null {
  for (const [code, v] of Object.entries(limits)) {
    if (!limitable(code)) return code === "SUPERADMIN" ? "Batas Superadmin dikunci (2 akun) dan tidak bisa diubah dari aplikasi." : `Role ${code} tidak punya batas kursi.`;
    if (v === null) continue;
    if (!Number.isInteger(v) || v < 1 || v > SEAT_MAX) return `Kursi harus angka 1 sampai ${SEAT_MAX}, atau kosongkan untuk tanpa batas.`;
    const n = counts[code] ?? 0;
    if (v < n) return `Role ini sudah dipegang ${n} akun aktif, jadi batasnya tidak bisa di bawah ${n}. Kurangi pemegangnya dulu.`;
  }
  return null;
}

export type TransferActor = { id: string; isSuper: boolean; isOwner: boolean };
export type TransferParty = { id: string; isActive: boolean; isOwner: boolean; isSuper: boolean; holds: boolean };

/**
 * Boleh tidak memindahkan `role` dari akun `from` ke akun `to`? Mengembalikan pesan penolakan, atau null bila boleh.
 * Role biasa: siapa pun yang boleh mengelola akun. Superadmin diperketat: hanya Superadmin utama, hanya dari akun aktif yang
 * bukan dirinya, dan server meminta kata sandi (serta kode 2 langkah bila aktif) lagi.
 */
export function transferVerdict(role: string, actor: TransferActor, from: TransferParty, to: TransferParty): string | null {
  if (from.id === to.id) return "Pilih dua akun yang berbeda.";
  if (!from.holds) return "Akun asal tidak memegang role ini.";
  if (to.holds) return "Akun tujuan sudah memegang role ini.";
  if (!to.isActive) return "Akun tujuan nonaktif. Aktifkan dulu sebelum memberi role.";
  if (blockedByOwner(from, actor.id) || blockedByOwner(to, actor.id)) return OWNER_MESSAGE;
  if ((from.isSuper || to.isSuper) && !actor.isSuper) return "Akun Superadmin hanya bisa diubah oleh Superadmin.";
  if (role === "PENGAWAS" && !actor.isSuper) return "Hanya Superadmin yang boleh mengelola role Pengawas.";
  if (role === "SUPERADMIN") {
    if (!actor.isSuper || !actor.isOwner) return "Hanya Superadmin utama yang boleh memindahkan role Superadmin.";
    if (from.isOwner) return "Role Superadmin utama tidak bisa dipindahkan.";
    if (!from.isActive) return "Role Superadmin hanya bisa dipindahkan dari akun yang aktif.";
  }
  return null;
}
