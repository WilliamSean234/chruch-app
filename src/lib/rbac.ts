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
  /** Kapan sesi/token ini dibuat (ms). Dipakai untuk mencabut sesi lama setelah kata sandi diganti. */
  authAt?: number;
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
  const unrestrictedRole = u.roles.some((r) => r.code !== "ADMIN_TIM" && r.code !== "PELAYAN" && r.code !== "PETUGAS_ABSEN" && r.code !== "PENGAWAS");
  if (unrestrictedRole) return null;
  const adminTim = u.roles.filter((r) => r.code === "ADMIN_TIM");
  if (adminTim.some((r) => r.teamTypeId === null)) return null;
  return adminTim.map((r) => r.teamTypeId as string);
}

/** Acara DRAFT belum untuk umum: hanya yang boleh mengatur acara (event.write: Superadmin dan Penjadwal). Admin Tim baru melihat acara setelah diterbitkan. */
export const canSeeDraftEvents = (u: AuthUser): boolean => can(u, "event.write");

/** Pastikan user boleh mengubah posisi dari tim tertentu (assignment/latihan). */
export function requireTeamAccess(u: AuthUser, teamTypeId: string): void {
  const scope = teamScope(u);
  if (scope !== null && !scope.includes(teamTypeId)) {
    throw new ApiError(403, "FORBIDDEN_TEAM", "Anda hanya boleh mengatur tim yang menjadi tanggung jawab Anda.");
  }
}

/**
 * Boleh menambah dan mengubah data orang (identitas jemaat): izin person.manage, hanya Superadmin dan Admin Jemaat.
 * Penjadwal dan Admin Tim tidak; mereka hanya mengatur pelayanan orang yang sudah terdaftar (lihat changePersonMinistries); Admin Tim EBM juga boleh mencabut pelayanan EBM.
 */
export function canManagePeople(u: AuthUser): boolean {
  return can(u, "person.manage");
}

export function requireManagePeople(u: AuthUser): void {
  if (!canManagePeople(u)) throw forbidden("Hanya Superadmin dan Admin Jemaat yang boleh menambah atau mengubah data orang.");
}

/** Admin Tim hanya boleh mengubah data identitas orang yang punya pelayanan di tim miliknya (`personTeamIds` = tim dari pelayanan orang itu). */
export function requirePersonInScope(u: AuthUser, personTeamIds: string[]): void {
  const scope = teamScope(u);
  if (scope === null) return;
  if (!personTeamIds.some((t) => scope.includes(t))) {
    throw new ApiError(403, "FORBIDDEN_TEAM", "Anda hanya boleh mengubah data orang yang melayani di tim Anda.");
  }
}
