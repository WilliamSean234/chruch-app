/**
 * Superadmin utama (pemilik): akunnya hanya bisa diubah, dinonaktifkan, dihapus, atau direset oleh dirinya sendiri, tidak oleh Superadmin lain.
 * Penandanya ada di database dan hanya bisa diubah dari terminal (npm run db:set-owner), tidak lewat aplikasi. Murni supaya mudah diuji.
 */
export const OWNER_MESSAGE = "Ini akun Superadmin utama. Hanya pemiliknya sendiri yang bisa mengubah, menonaktifkan, menghapus, atau mereset akun ini.";

/** Ditolak bila akun sasarannya Superadmin utama dan pelakunya bukan akun itu sendiri. */
export function blockedByOwner(target: { id: string; isOwner: boolean }, actorUserId: string | undefined): boolean {
  return target.isOwner && target.id !== actorUserId;
}
