import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { badRequest, conflict, notFound } from "./errors";

export const teamBody = z.object({ name: z.string().trim().min(1).max(80), sortOrder: z.number().int().optional() });
export const ministryBody = z.object({
  teamTypeId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  rehearsalRequiredDefault: z.boolean().default(false),
  sortOrder: z.number().int().optional(),
});

const dup = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export const listTeams = (tenantId: string) =>
  prisma.teamType.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { ministries: { where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
  });

export async function createTeam(tenantId: string, b: z.infer<typeof teamBody>) {
  const old = await prisma.teamType.findFirst({ where: { tenantId, name: b.name } });
  if (old && !old.deletedAt) throw conflict(`Tim "${b.name}" sudah ada.`);
  if (old) return prisma.teamType.update({ where: { id: old.id }, data: { deletedAt: null, sortOrder: b.sortOrder ?? old.sortOrder } });
  return prisma.teamType.create({ data: { tenantId, name: b.name, sortOrder: b.sortOrder ?? 100, isCore: false } });
}

export async function updateTeam(tenantId: string, id: string, b: z.infer<typeof teamBody>) {
  const t = await prisma.teamType.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!t) throw notFound("Tim");
  try {
    return await prisma.teamType.update({ where: { id }, data: { name: b.name, sortOrder: b.sortOrder } });
  } catch (e) {
    if (dup(e)) throw conflict(`Nama tim "${b.name}" sudah dipakai.`);
    throw e;
  }
}

export async function deleteTeam(tenantId: string, id: string) {
  const t = await prisma.teamType.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!t) throw notFound("Tim");
  if (t.isCore) throw badRequest("Tim paten (pemusik, EBM, usher, dst.) tidak boleh dihapus.");
  const used = await prisma.eventTeam.count({ where: { teamTypeId: id, event: { deletedAt: null, endsAt: { gte: new Date() } } } });
  if (used > 0) throw conflict(`Tim masih dipakai di ${used} acara yang akan datang.`);
  const now = new Date();
  await prisma.$transaction([
    prisma.ministry.updateMany({ where: { teamTypeId: id }, data: { deletedAt: now } }),
    prisma.teamType.update({ where: { id }, data: { deletedAt: now } }),
  ]);
}

export async function createMinistry(tenantId: string, b: z.infer<typeof ministryBody>) {
  const team = await prisma.teamType.findFirst({ where: { id: b.teamTypeId, tenantId, deletedAt: null } });
  if (!team) throw notFound("Tim");
  const old = await prisma.ministry.findFirst({ where: { tenantId, teamTypeId: b.teamTypeId, name: b.name } });
  if (old && !old.deletedAt) throw conflict(`Posisi "${b.name}" sudah ada di tim ${team.name}.`);
  if (old) {
    return prisma.ministry.update({ where: { id: old.id }, data: { deletedAt: null, rehearsalRequiredDefault: b.rehearsalRequiredDefault } });
  }
  return prisma.ministry.create({
    data: { tenantId, teamTypeId: b.teamTypeId, name: b.name, rehearsalRequiredDefault: b.rehearsalRequiredDefault, sortOrder: b.sortOrder ?? 100 },
  });
}

export async function updateMinistry(tenantId: string, id: string, b: Partial<z.infer<typeof ministryBody>>) {
  const m = await prisma.ministry.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!m) throw notFound("Posisi pelayanan");
  try {
    // tim induk tidak dipindah; hapus lalu buat baru bila perlu
    return await prisma.ministry.update({
      where: { id },
      data: { name: b.name, rehearsalRequiredDefault: b.rehearsalRequiredDefault, sortOrder: b.sortOrder },
    });
  } catch (e) {
    if (dup(e)) throw conflict("Nama posisi sudah dipakai di tim ini.");
    throw e;
  }
}

export async function deleteMinistry(tenantId: string, id: string) {
  const m = await prisma.ministry.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!m) throw notFound("Posisi pelayanan");
  const used = await prisma.eventAssignment.count({ where: { ministryId: id, event: { deletedAt: null, endsAt: { gte: new Date() } } } });
  if (used > 0) throw conflict(`Posisi masih dipakai di ${used} penugasan acara yang akan datang.`);
  await prisma.ministry.update({ where: { id }, data: { deletedAt: new Date() } });
}
