import { prisma } from "./prisma";

/** Nama pembuat jadwal: nama orang bila akunnya terhubung ke data orang, selain itu bagian depan emailnya. */
export async function creatorNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!uniq.length) return out;
  const users = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, email: true, person: { select: { name: true } } } });
  for (const u of users) out.set(u.id, u.person?.name ?? u.email.split("@")[0]);
  return out;
}
