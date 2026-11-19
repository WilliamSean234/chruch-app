import { z } from "zod";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { notFound } from "./errors";
import { requirePermission, type AuthUser } from "./rbac";

/** Profil gereja: nama dan kontak yang tampil di menu samping serta kop cetak notulen. */
export const DEFAULT_TAGLINE = "Penjadwalan gereja";
const optional = (max: number) => z.string().trim().max(max).transform((v) => v || null).nullable().optional();
export const churchProfileBody = z.object({
  name: z.string().trim().min(2, "Nama gereja wajib diisi").max(80),
  tagline: optional(80),
  address: optional(200),
  phone: optional(40),
});

export type ChurchProfile = { name: string; tagline: string; address: string | null; phone: string | null };

export async function getChurchProfile(tenantId: string): Promise<ChurchProfile> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, tagline: true, address: true, phone: true } });
  if (!t) throw notFound("Gereja");
  return { name: t.name, tagline: t.tagline || DEFAULT_TAGLINE, address: t.address, phone: t.phone };
}

export async function updateChurchProfile(u: AuthUser, b: z.infer<typeof churchProfileBody>) {
  requirePermission(u, "user.manage");
  await prisma.tenant.update({ where: { id: u.tenantId }, data: { name: b.name, tagline: b.tagline ?? null, address: b.address ?? null, phone: b.phone ?? null } });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "church.profile.update", entity: "Tenant", entityId: u.tenantId, payload: { name: b.name } });
  return getChurchProfile(u.tenantId);
}
