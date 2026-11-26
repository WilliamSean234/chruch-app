import { z } from "zod";
import { prisma } from "./prisma";
import { badRequest } from "./errors";

/** Acara khusus komunitas: kosong = acara umum. Isian di permintaan buat/ubah acara dan template. */
export const audienceCommunityIds = z.array(z.string().uuid()).max(30);

/** Hapus duplikat dan pastikan semua komunitas ada di gereja ini (dan belum dihapus). */
export async function checkAudience(tenantId: string, ids: string[]): Promise<string[]> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return [];
  const n = await prisma.community.count({ where: { id: { in: uniq }, tenantId, deletedAt: null } });
  if (n !== uniq.length) throw badRequest("Ada komunitas yang tidak valid.");
  return uniq;
}

/** Nama komunitas untuk tampilan (urut abjad). Komunitas yang sudah dihapus tidak ikut. */
export async function audienceView(tenantId: string, ids: string[]): Promise<{ id: string; name: string }[]> {
  if (!ids.length) return [];
  return prisma.community.findMany({ where: { id: { in: ids }, tenantId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}
