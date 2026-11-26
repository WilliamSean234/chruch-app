import { prisma } from "./prisma";
import { badRequest, forbidden } from "./errors";
import { blockedByOwner, OWNER_MESSAGE } from "./ownerRules";
import { SUPERADMIN_FULL_MESSAGE, superadminSlotFull } from "./superadminLimit";

/**
 * Jangan sampai aplikasi kehilangan Superadmin aktif terakhirnya, atau seorang Superadmin mengunci dirinya sendiri.
 * Dipakai semua jalur yang menonaktifkan akun (hapus akun, hapus orang). `actor` kosong = tidak ada pemanggil yang dikecualikan.
 */
export async function assertCanDeactivate(tenantId: string, personId: string, actorUserId?: string) {
  const user = await prisma.user.findFirst({ where: { personId, tenantId, deletedAt: null, isActive: true }, include: { roles: { include: { role: true } } } });
  if (!user) return; // tidak ada akun aktif yang terdampak
  if (blockedByOwner(user, actorUserId)) throw forbidden(OWNER_MESSAGE);
  if (actorUserId && user.id === actorUserId) throw badRequest("Anda tidak bisa menonaktifkan akun Anda sendiri.");
  if (!user.roles.some((r) => r.role.isSuperadmin)) return;
  const others = await prisma.user.count({ where: { tenantId, deletedAt: null, isActive: true, id: { not: user.id }, roles: { some: { role: { isSuperadmin: true } } } } });
  if (others === 0) throw badRequest("Harus tersisa minimal satu Superadmin aktif.");
}

/** Tolak bila sudah ada cukup Superadmin aktif lain (batas di superadminLimit). `exceptUserId` = akun yang sedang diubah, tidak dihitung dua kali. */
export async function assertSuperadminSlot(tenantId: string, exceptUserId?: string) {
  const others = await prisma.user.count({
    where: { tenantId, deletedAt: null, isActive: true, ...(exceptUserId ? { id: { not: exceptUserId } } : {}), roles: { some: { role: { isSuperadmin: true } } } },
  });
  if (superadminSlotFull(others)) throw badRequest(SUPERADMIN_FULL_MESSAGE);
}
