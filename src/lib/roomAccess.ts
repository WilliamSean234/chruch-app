import { forbidden } from "./errors";
import { canScheduleInAnyGroup } from "./groups";
import { can, type AuthUser } from "./rbac";

/**
 * Hak MELIHAT pemakaian dan ketersediaan ruangan (hanya baca): Penjadwal global, pengelola master data,
 * dan anggota kelompok yang jabatannya berhak menjadwalkan rapat. Mengubah ruangan tetap `master.write`.
 */
export async function canViewRooms(u: AuthUser): Promise<boolean> {
  return can(u, "event.write") || can(u, "master.write") || (await canScheduleInAnyGroup(u));
}

export async function requireRoomView(u: AuthUser): Promise<void> {
  if (!(await canViewRooms(u))) throw forbidden();
}
