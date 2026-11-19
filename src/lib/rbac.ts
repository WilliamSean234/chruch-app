import { ApiError, forbidden } from "./errors";

export type RoleGrant = { code: string; isSuperadmin: boolean; teamTypeId: string | null };

/** Isi yang disimpan di JWT. tenantId HANYA berasal dari sini, tidak pernah dari body/query. */
export type AuthUser = {
  userId: string;
  tenantId: string;
  personId: string | null;
  roles: RoleGrant[];
  permissions: string[];
  /** true = akun harus ganti kata sandi dulu sebelum memakai aplikasi. */
  mustChangePassword?: boolean;
};

export const isSuperadmin = (u: AuthUser) => u.roles.some((r) => r.isSuperadmin);

/** Izin dasar: setiap orang yang sudah masuk boleh melihat kalender dan jadwalnya sendiri, tanpa perlu role apa pun. */
const BASE_PERMISSIONS = new Set(["calendar.read", "schedule.read-own"]);

/** Superadmin melewati semua permission. */
export function can(u: AuthUser, permission: string): boolean {
  return BASE_PERMISSIONS.has(permission) || isSuperadmin(u) || u.permissions.includes(permission);
}

export function requirePermission(u: AuthUser, permission: string): void {
  if (!can(u, permission)) throw forbidden();
}

/**
 * Cakupan tim untuk Admin Tim.
 * - null  : tanpa batas (Superadmin, Penjadwal, atau Admin Tim yang teamTypeId-nya null)
 * - array : hanya tim-tim ini
 */
export function teamScope(u: AuthUser): string[] | null {
  if (isSuperadmin(u)) return null;
  const unrestrictedRole = u.roles.some((r) => r.code !== "ADMIN_TIM" && r.code !== "PELAYAN" && r.code !== "PETUGAS_ABSEN");
  if (unrestrictedRole) return null;
  const adminTim = u.roles.filter((r) => r.code === "ADMIN_TIM");
  if (adminTim.some((r) => r.teamTypeId === null)) return null;
  return adminTim.map((r) => r.teamTypeId as string);
}

/** Pastikan user boleh mengubah posisi dari tim tertentu (assignment/latihan). */
export function requireTeamAccess(u: AuthUser, teamTypeId: string): void {
  const scope = teamScope(u);
  if (scope !== null && !scope.includes(teamTypeId)) {
    throw new ApiError(403, "FORBIDDEN_TEAM", "Anda hanya boleh mengatur tim yang menjadi tanggung jawab Anda.");
  }
}
