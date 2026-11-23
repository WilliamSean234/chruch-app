import { prisma } from "../prisma";
import { k, type Ctx } from "./common";
import { BASE_POSITION, type GroupState, type Grp } from "./groups";

/** Muat kelompok, jabatan, dan anggota yang sudah ada supaya sheet bisa dicocokkan dan data dobel dilewati. */
export async function loadGroups(tenantId: string): Promise<GroupState> {
  const rows = await prisma.meetingGroup.findMany({
    where: { tenantId },
    include: { positions: true, members: { include: { positions: { select: { positionId: true } }, person: { select: { name: true } } } } },
  });
  const groups = new Map<string, Grp>();
  for (const g of rows) {
    groups.set(k(g.name), {
      id: g.id, name: g.name, isNew: false, deleted: !!g.deletedAt, quorum: g.quorumMin, sortOrder: g.sortOrder,
      positions: new Map(g.positions.map((p) => [k(p.name), {
        id: p.id, name: p.name, isNew: false, deleted: !!p.deletedAt, auto: p.name === BASE_POSITION, sortOrder: p.sortOrder, seats: p.seats,
        caps: { schedule: p.canSchedule, write: p.canWriteMinutes, finalize: p.canFinalize, manage: p.canManageMembers },
      }])),
      members: new Map(g.members.map((m) => [m.personId, { id: m.id, personId: m.personId, name: m.person.name, isNew: false, left: !!m.leftAt, positionIds: m.positions.map((x) => x.positionId) }])),
    });
  }
  return { groups };
}

/** Tulis kelompok, jabatan, dan anggota baru dalam satu transaksi (berhasil semua atau tidak sama sekali). */
export async function flushGroups(ctx: Ctx, gs: GroupState) {
  const { rep, u } = ctx;
  const all = [...gs.groups.values()];
  const newGroups = all.filter((g) => g.isNew);
  const newPositions = all.flatMap((g) => [...g.positions.values()].filter((p) => p.isNew).map((p) => ({ g, p })));
  const newMembers = all.flatMap((g) => [...g.members.values()].filter((m) => m.isNew).map((m) => ({ g, m })));
  const rejoin = all.flatMap((g) => [...g.members.values()].filter((m) => m.rejoin).map((m) => ({ g, m })));
  if (!newGroups.length && !newPositions.length && !newMembers.length && !rejoin.length) return;

  try {
    await prisma.$transaction(
      async (tx) => {
        if (newGroups.length) await tx.meetingGroup.createMany({ data: newGroups.map((g) => ({ id: g.id, tenantId: u.tenantId, name: g.name, quorumMin: g.quorum, sortOrder: g.sortOrder })) });
        if (newPositions.length) {
          await tx.groupPosition.createMany({
            data: newPositions.map(({ g, p }) => ({
              id: p.id, groupId: g.id, name: p.name, sortOrder: p.sortOrder, seats: p.seats,
              canSchedule: p.caps.schedule, canWriteMinutes: p.caps.write, canFinalize: p.caps.finalize, canManageMembers: p.caps.manage,
            })),
          });
        }
        if (newMembers.length) await tx.groupMember.createMany({ data: newMembers.map(({ g, m }) => ({ id: m.id, groupId: g.id, personId: m.personId })) });
        for (const { m } of rejoin) {
          await tx.groupMember.update({ where: { id: m.id }, data: { leftAt: null, joinedAt: new Date() } });
          await tx.groupMemberPosition.deleteMany({ where: { memberId: m.id } });
        }
        const links = [...newMembers, ...rejoin].flatMap(({ m }) => m.positionIds.map((positionId) => ({ memberId: m.id, positionId })));
        if (links.length) await tx.groupMemberPosition.createMany({ data: links, skipDuplicates: true });
      },
      { timeout: 60_000, maxWait: 20_000 },
    );
  } catch (e) {
    console.error("[impor] gagal menyimpan kelompok rapat:", e);
    const msg = "Gagal disimpan, jadi tidak ada data kelompok rapat yang berubah. Periksa ulang file lalu impor lagi.";
    for (const g of newGroups) if (g.row) rep.fail("KelompokRapat", g.row, msg);
    for (const { p } of newPositions) if (p.row) rep.fail("JabatanKelompok", p.row, msg);
    for (const { m } of [...newMembers, ...rejoin]) if (m.row) rep.fail("AnggotaKelompok", m.row, msg);
  }
}
