import { can, type AuthUser } from "./rbac";
import { pendingCount } from "./registrations";
import { listSwaps } from "./swaps";

/** Angka penanda di menu. Hanya yang boleh dilihat pengguna ini yang terisi; sisanya 0. */
export type BadgeCounts = { pengaturan: number; jadwal: number };

/**
 * pengaturan = permintaan daftar akun yang menunggu persetujuan (yang boleh mengelola akun).
 * jadwal = permintaan pengganti dari pelayan yang menunggu keputusan (Penjadwal, atau Admin Tim untuk timnya).
 * Dipakai saat halaman dibuat (AppShell) dan oleh pembaruan langsung (GET /api/v1/me/badges).
 */
export async function badgeCounts(u: AuthUser): Promise<BadgeCounts> {
  const [pengaturan, jadwal] = await Promise.all([
    can(u, "user.manage") ? pendingCount(u.tenantId).catch(() => 0) : 0,
    can(u, "assignment.write") ? listSwaps(u).then((r) => r.items.length).catch(() => 0) : 0,
  ]);
  return { pengaturan, jadwal };
}
