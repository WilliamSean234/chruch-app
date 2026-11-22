import type { Prisma } from "@prisma/client";
import { audit } from "./audit";

type Db = Prisma.TransactionClient;

/** Nama kelompok rapat Penjadwal acara: "TKI". */
export const TKI_GROUP = /^tki$/i;

/**
 * Setiap orang yang akunnya berperan Penjadwal otomatis menjadi anggota kelompok "TKI" (dibuat bila belum ada).
 * Sifatnya menambah saja, sama seperti kelompok EBM: anggota yang sudah ada tidak diubah, dan orang yang tidak lagi
 * berperan Penjadwal tidak dikeluarkan otomatis (isi rapat hanya terbaca anggota, jadi keluarnya anggota dikelola manual).
 *
 * @param only    batasi ke orang-orang ini (mis. yang baru diberi peran Penjadwal); tanpa ini, semua Penjadwal diperiksa.
 * @param rejoin  anggota yang sudah keluar dimasukkan lagi; pakai true hanya saat peran Penjadwal baru saja diberikan.
 */
export async function syncTkiGroup(db: Db, tenantId: string, opts: { only?: string[]; rejoin?: boolean; userId?: string | null } = {}) {
  if (opts.only && opts.only.length === 0) return { added: 0, rejoined: 0 };

  const users = await db.user.findMany({
    where: {
      tenantId, deletedAt: null, isActive: true,
      personId: opts.only ? { in: opts.only } : { not: null },
      roles: { some: { role: { code: "PENJADWAL" } } },
      person: { deletedAt: null },
    },
    select: { personId: true, person: { select: { name: true } } },
  });
  const people = new Map(users.flatMap((x) => (x.personId && x.person ? [[x.personId, x.person.name] as const] : [])));
  if (!people.size) return { added: 0, rejoined: 0 };

  const groups = await db.meetingGroup.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true, sortOrder: true } });
  let group = groups.find((g) => TKI_GROUP.test(g.name.trim()));
  if (!group) {
    const nextOrder = groups.reduce((m, g) => Math.max(m, g.sortOrder), 0) + 1;
    group = await db.meetingGroup.create({ data: { tenantId, name: "TKI", sortOrder: nextOrder }, select: { id: true, name: true, sortOrder: true } });
    await audit({ tenantId, userId: opts.userId ?? null, action: "group.create", entity: "MeetingGroup", entityId: group.id, payload: { name: group.name, auto: "TKI" } }, db);
  }

  const members = await db.groupMember.findMany({ where: { groupId: group.id, personId: { in: [...people.keys()] } }, select: { id: true, personId: true, leftAt: true } });
  const byPerson = new Map(members.map((m) => [m.personId, m]));
  let added = 0, rejoined = 0;
  for (const [personId, name] of people) {
    const m = byPerson.get(personId);
    if (!m) {
      await db.groupMember.create({ data: { groupId: group.id, personId } });
      await audit({ tenantId, userId: opts.userId ?? null, action: "group.member.add", entity: "MeetingGroup", entityId: group.id, reason: "Otomatis: berperan Penjadwal", payload: { personId, name, auto: "TKI" } }, db);
      added++;
    } else if (m.leftAt && opts.rejoin) {
      await db.groupMember.update({ where: { id: m.id }, data: { leftAt: null, joinedAt: new Date() } });
      await audit({ tenantId, userId: opts.userId ?? null, action: "group.member.add", entity: "MeetingGroup", entityId: group.id, reason: "Otomatis: berperan Penjadwal", payload: { personId, name, auto: "TKI", rejoin: true } }, db);
      rejoined++;
    }
  }
  return { added, rejoined };
}
