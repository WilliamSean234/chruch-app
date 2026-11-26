import { blockedByOwner, OWNER_MESSAGE } from "./ownerRules";
import { MAX_SUPERADMINS } from "./superadminLimit";

/** Batas jumlah akun aktif per role. Role yang tidak tercantum tidak dibatasi. Murni supaya mudah diuji. */
export const ROLE_LIMITS: Record<string, number> = { SUPERADMIN: MAX_SUPERADMINS };
export const roleLimit = (code: string): number | null => ROLE_LIMITS[code] ?? null;
/** Penuh: ada batas dan sudah terpakai semua. */
export const roleIsFull = (code: string, activeCount: number): boolean => { const m = roleLimit(code); return m !== null && activeCount >= m; };

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
