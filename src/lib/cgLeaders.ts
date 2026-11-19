import { z } from "zod";
import { prisma } from "./prisma";
import { badRequest, notFound } from "./errors";

/** Daftar CG beserta leader-nya (satu CG boleh punya lebih dari satu leader). */
export async function listCgGroupsWithLeaders(tenantId: string) {
  const rows = await prisma.cgGroup.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: { name: "asc" },
    include: { leaders: { where: { person: { deletedAt: null } }, include: { person: { select: { id: true, name: true, title: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    leaders: r.leaders.map((l) => ({ id: l.person.id, name: l.person.name, title: l.person.title })).sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export const leadersBody = z.object({ personIds: z.array(z.string().uuid()).max(20, "Maksimal 20 leader per CG.") });

/** Ganti seluruh daftar leader sebuah CG. */
export async function setCgLeaders(tenantId: string, cgGroupId: string, personIds: string[]) {
  const cg = await prisma.cgGroup.findFirst({ where: { id: cgGroupId, tenantId, deletedAt: null } });
  if (!cg) throw notFound("Kelompok CG");
  const ids = [...new Set(personIds)];
  if (ids.length && (await prisma.person.count({ where: { id: { in: ids }, tenantId, deletedAt: null } })) !== ids.length) throw badRequest("Ada orang yang tidak valid.");
  await prisma.$transaction([
    prisma.cgLeader.deleteMany({ where: { cgGroupId } }),
    prisma.cgLeader.createMany({ data: ids.map((personId) => ({ cgGroupId, personId })) }),
  ]);
  return { id: cg.id, name: cg.name, count: ids.length };
}
