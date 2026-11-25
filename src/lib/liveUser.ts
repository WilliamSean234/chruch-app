import { prisma } from "./prisma";
import type { AuthUser } from "./rbac";
import { LIVE_MAX, LIVE_TTL_MS, sessionRevoked } from "./sessionRules";

type Live = Omit<AuthUser, "authAt"> & { validFrom: Date | null };
const cache = new Map<string, { until: number; live: Live | null }>();

/** Buang catatan cache satu pengguna (setelah akun, role, atau kata sandinya berubah di server ini). */
export function forgetLiveUser(userId: string) {
  cache.delete(userId);
}

async function load(userId: string, tenantId: string): Promise<Live | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId, deletedAt: null, isActive: true },
    select: {
      personId: true, mustChangePassword: true, sessionsValidFrom: true,
      roles: { select: { teamTypeId: true, role: { select: { code: true, isSuperadmin: true, permissions: { select: { permission: { select: { code: true } } } } } } } },
    },
  });
  if (!user) return null;
  const permissions = new Set<string>();
  for (const ur of user.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission.code);
  return {
    userId, tenantId, personId: user.personId,
    roles: user.roles.map((ur) => ({ code: ur.role.code, isSuperadmin: ur.role.isSuperadmin, teamTypeId: ur.teamTypeId })),
    permissions: [...permissions],
    mustChangePassword: user.mustChangePassword,
    validFrom: user.sessionsValidFrom,
  };
}

/**
 * Keadaan akun SEKARANG untuk sesi/token ini. Isi token (role, izin) hanya dipakai untuk mengenali pemiliknya; izin selalu dari database,
 * jadi akun yang dinonaktifkan, dihapus, dicabut rolenya, atau sudah ganti kata sandi langsung berlaku tanpa menunggu sesinya habis.
 * Mengembalikan null bila sesi tidak boleh dipakai lagi.
 */
export async function liveUser(claims: AuthUser): Promise<AuthUser | null> {
  const now = Date.now();
  let hit = cache.get(claims.userId);
  if (!hit || hit.until < now) {
    hit = { until: now + LIVE_TTL_MS, live: await load(claims.userId, claims.tenantId) };
    if (cache.size >= LIVE_MAX) cache.clear();
    cache.set(claims.userId, hit);
  }
  const live = hit.live;
  if (!live || live.tenantId !== claims.tenantId) return null;
  if (sessionRevoked(claims.authAt, live.validFrom)) return null;
  return { userId: live.userId, tenantId: live.tenantId, personId: live.personId, roles: live.roles, permissions: live.permissions, mustChangePassword: live.mustChangePassword };
}
