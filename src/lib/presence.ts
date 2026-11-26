import { prisma } from "./prisma";
import { PRESENCE_MAX_CLIENTS, presenceCutoff } from "./presenceRules";

/** Catat bahwa tab `clientId` milik `userId` sedang terbuka dan terlihat. Keadaan normal: satu UPDATE saja. */
export async function beat(tenantId: string, userId: string, clientId: string, now = new Date()): Promise<void> {
  const upd = await prisma.presence.updateMany({ where: { userId, clientId }, data: { seenAt: now } });
  if (upd.count === 0) {
    // tab baru: batasi jumlah tab per akun supaya tabel tidak bisa dibanjiri
    const mine = await prisma.presence.findMany({ where: { userId }, orderBy: { seenAt: "desc" }, select: { id: true }, skip: PRESENCE_MAX_CLIENTS - 1 });
    if (mine.length) await prisma.presence.deleteMany({ where: { id: { in: mine.map((m) => m.id) } } });
    await prisma.presence.upsert({
      where: { userId_clientId: { userId, clientId } },
      create: { tenantId, userId, clientId, seenAt: now },
      update: { seenAt: now },
    });
  }
  if (Math.random() < 0.02) await prisma.presence.deleteMany({ where: { seenAt: { lt: new Date(now.getTime() - 3_600_000) } } }); // bersihkan sisa lama
}

/** Tab ditutup, disembunyikan, atau pemiliknya diam terlalu lama: langsung offline (bila tak ada tab lain yang terbuka). */
export async function leave(userId: string, clientId?: string): Promise<void> {
  await prisma.presence.deleteMany({ where: clientId ? { userId, clientId } : { userId } });
}

/** Id akun (User.id) yang sedang online dari `userIds`. */
export async function onlineAmong(userIds: string[], now = new Date()): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.presence.findMany({ where: { userId: { in: userIds }, seenAt: { gt: presenceCutoff(now) } }, distinct: ["userId"], select: { userId: true } });
  return new Set(rows.map((r) => r.userId));
}

/** Id orang (Person.id) yang akunnya sedang online di satu gereja. */
export async function onlinePersonIds(tenantId: string, now = new Date()): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { tenantId, deletedAt: null, isActive: true, personId: { not: null }, presence: { some: { seenAt: { gt: presenceCutoff(now) } } } },
    select: { personId: true },
  });
  return rows.map((r) => r.personId!).sort();
}
