import type { Prisma } from "@prisma/client";
import { audit } from "./audit";
import { needsEbmGroupPrompt, teamKind } from "./seatRules";

type Db = Prisma.TransactionClient;

/** Nama kelompok rapat yang dianggap kelompok EBM: "EBM" atau "Tim EBM". */
export const EBM_GROUP = /^(tim\s+)?ebm$/i;

/**
 * Setiap orang yang melayani di bidang EBM (punya posisi di tim EBM) otomatis menjadi anggota kelompok "EBM".
 * Kelompoknya dibuat bila belum ada. Sifatnya menambah saja: anggota yang sudah ada, termasuk jabatannya, tidak diubah,
 * dan orang yang berhenti melayani EBM tidak dikeluarkan otomatis (isi rapat hanya terbaca anggota, jadi keluarnya anggota dikelola manual).
 *
 * @param only    batasi ke orang-orang ini (mis. yang baru ditambahkan ke posisi EBM); tanpa ini, semua orang EBM diperiksa.
 * @param rejoin  anggota yang sudah keluar (leftAt terisi) dimasukkan lagi. Pakai true hanya saat orangnya baru saja
 *                ditambahkan ke posisi EBM; pada pemeriksaan menyeluruh anggota yang sengaja dikeluarkan tidak dikembalikan.
 */
export async function syncEbmGroup(db: Db, tenantId: string, opts: { only?: string[]; rejoin?: boolean; userId?: string | null } = {}) {
  if (opts.only && opts.only.length === 0) return { added: 0, rejoined: 0 };

  const teams = (await db.teamType.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true } })).filter((t) => teamKind(t.name) === "EBM");
  if (!teams.length) return { added: 0, rejoined: 0 };

  const serving = await db.personMinistry.findMany({
    where: {
      ...(opts.only ? { personId: { in: opts.only } } : {}),
      ministry: { deletedAt: null, teamTypeId: { in: teams.map((t) => t.id) } },
      person: { tenantId, deletedAt: null },
    },
    select: { personId: true, person: { select: { name: true } } },
  });
  const people = new Map(serving.map((s) => [s.personId, s.person.name]));
  if (!people.size) return { added: 0, rejoined: 0 };

  const groups = await db.meetingGroup.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true, sortOrder: true } });
  let group = groups.find((g) => EBM_GROUP.test(g.name.trim()));
  if (!group) {
    const nextOrder = groups.reduce((m, g) => Math.max(m, g.sortOrder), 0) + 1;
    group = await db.meetingGroup.create({ data: { tenantId, name: "EBM", sortOrder: nextOrder }, select: { id: true, name: true, sortOrder: true } });
    await audit({ tenantId, userId: opts.userId ?? null, action: "group.create", entity: "MeetingGroup", entityId: group.id, payload: { name: group.name, auto: "EBM" } }, db);
  }

  const members = await db.groupMember.findMany({ where: { groupId: group.id, personId: { in: [...people.keys()] } }, select: { id: true, personId: true, leftAt: true } });
  const byPerson = new Map(members.map((m) => [m.personId, m]));
  let added = 0, rejoined = 0;
  for (const [personId, name] of people) {
    const m = byPerson.get(personId);
    if (!m) {
      await db.groupMember.create({ data: { groupId: group.id, personId } });
      await audit({ tenantId, userId: opts.userId ?? null, action: "group.member.add", entity: "MeetingGroup", entityId: group.id, reason: "Otomatis: melayani di EBM", payload: { personId, name, auto: "EBM" } }, db);
      added++;
    } else if (m.leftAt && opts.rejoin) {
      await db.groupMember.update({ where: { id: m.id }, data: { leftAt: null, joinedAt: new Date() } });
      await audit({ tenantId, userId: opts.userId ?? null, action: "group.member.add", entity: "MeetingGroup", entityId: group.id, reason: "Otomatis: melayani di EBM", payload: { personId, name, auto: "EBM", rejoin: true } }, db);
      rejoined++;
    }
  }
  return { added, rejoined };
}

/**
 * Apakah penambahan pelayanan ini perlu konfirmasi "masukkan juga ke kelompok EBM?" (orang yang pertama kali diberi pelayanan EBM
 * dan belum anggota aktif kelompok EBM). Dipakai tambah pelayanan manual; impor dan jadwal tim tetap otomatis.
 */
export async function ebmGroupPromptFor(db: Db, tenantId: string, personId: string, addMinistryIds: string[]) {
  if (!addMinistryIds.length) return false;
  const rows = await db.ministry.findMany({ where: { id: { in: addMinistryIds }, tenantId }, select: { teamType: { select: { name: true } } } });
  const addsEbm = rows.some((r) => teamKind(r.teamType.name) === "EBM");
  if (!addsEbm) return false;
  const have = await db.personMinistry.findMany({ where: { personId, ministry: { deletedAt: null } }, select: { ministry: { select: { teamType: { select: { name: true } } } } } });
  const hasEbmNow = have.some((h) => teamKind(h.ministry.teamType.name) === "EBM");
  const groups = await db.meetingGroup.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true } });
  const ebm = groups.find((g) => EBM_GROUP.test(g.name.trim()));
  const activeMember = !!ebm && !!(await db.groupMember.findFirst({ where: { groupId: ebm.id, personId, leftAt: null }, select: { id: true } }));
  return needsEbmGroupPrompt({ addsEbm, hasEbmNow, activeMember });
}
