import type { Prisma } from "@prisma/client";
import { ADMIN_TIM_CAPS, ADMIN_TIM_LEGACY_NAMES, ADMIN_TIM_POSITION } from "./groupRules";

type Db = Prisma.TransactionClient;

/**
 * Pastikan kelompok ini punya jabatan wajib "Admin Tim" dengan akses penuh. Dibuat bila belum ada; yang terhapus dihidupkan lagi;
 * jabatan lama "Admin Tim EBM" atau "Penjadwal EBM" dinaikkan di tempat (pemegangnya ikut). Hak jabatan ini selalu dikembalikan penuh.
 */
export async function ensureAdminTimPosition(db: Db, groupId: string) {
  const own = await db.groupPosition.findFirst({ where: { groupId, name: ADMIN_TIM_POSITION } });
  if (own) {
    const ok = !own.deletedAt && own.canSchedule && own.canWriteMinutes && own.canFinalize && own.canManageMembers;
    return ok ? own : db.groupPosition.update({ where: { id: own.id }, data: { deletedAt: null, ...ADMIN_TIM_CAPS } });
  }
  for (const legacy of ADMIN_TIM_LEGACY_NAMES) {
    const old = await db.groupPosition.findFirst({ where: { groupId, name: legacy, deletedAt: null } });
    if (old) return db.groupPosition.update({ where: { id: old.id }, data: { name: ADMIN_TIM_POSITION, seats: null, ...ADMIN_TIM_CAPS } });
  }
  return db.groupPosition.create({ data: { groupId, name: ADMIN_TIM_POSITION, sortOrder: 0, seats: null, ...ADMIN_TIM_CAPS } });
}
