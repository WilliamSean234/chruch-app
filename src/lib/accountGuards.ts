import { prisma } from "./prisma";
import { badRequest } from "./errors";

/**
 * Jangan sampai aplikasi kehilangan Superadmin aktif terakhirnya, atau seorang Superadmin mengunci dirinya sendiri.
 * Dipakai semua jalur yang menonaktifkan akun (hapus akun, hapus orang). `actor` kosong = tidak ada pemanggil yang dikecualikan.
 */
export async function assertCanDeactivate(tenantId: string, personId: string, actorUserId?: string) {
  const user = await prisma.user.findFirst({ where: { personId, tenantId, deletedAt: null, isActive: true }, include: { roles: { include: { role: true } } } });
  if (!user) return; // tidak ada akun aktif yang terdampak
  if (actorUserId && user.id === actorUserId) throw badRequest("Anda tidak bisa menonaktifkan akun Anda sendiri.");
  if (!user.roles.some((r) => r.role.isSuperadmin)) return;
  const others = await prisma.user.count({ where: { tenantId, deletedAt: null, isActive: true, id: { not: user.id }, roles: { some: { role: { isSuperadmin: true } } } } });
  if (others === 0) throw badRequest("Harus tersisa minimal satu Superadmin aktif.");
}
