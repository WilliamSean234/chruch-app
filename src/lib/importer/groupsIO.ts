import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { nextDocNumber } from "../docNumber";
import { addMinutes, localParts, zonedToUtc } from "../time";
import { k, type Ctx } from "./common";
import { BASE_POSITION, type GroupState, type Grp } from "./groups";
import { fmtRange, type Ledger } from "./ledger";
import type { MasterState } from "./master";
import { meetingKey, type Mtg } from "./rapat";

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
    // rapat dari kelompok yang gagal dibuat tidak bisa disimpan; ditandai di writeMeetings
    for (const g of newGroups) g.failed = true;
  }
}

/** Rapat yang sudah ada (kelompok + judul + tanggal sama) pada rentang tanggal sheet Rapat. */
export async function loadExistingMeetings(tenantId: string, dates: string[], gs: GroupState): Promise<Set<string>> {
  const out = new Set<string>();
  if (!dates.length) return out;
  const sorted = [...dates].sort();
  const from = zonedToUtc(sorted[0], "00:00");
  const to = addMinutes(zonedToUtc(sorted[sorted.length - 1], "23:59"), 1);
  const rows = await prisma.event.findMany({
    where: { tenantId, kind: "RAPAT", deletedAt: null, status: { not: "CANCELLED" }, startsAt: { gte: from, lt: to } },
    select: { groupId: true, title: true, startsAt: true },
  });
  const known = new Set([...gs.groups.values()].map((g) => g.id));
  for (const e of rows) if (e.groupId && known.has(e.groupId)) out.add(meetingKey(e.groupId, e.title, localParts(e.startsAt).date));
  return out;
}

/** Masukkan pemakaian ruangan yang sudah ada di database ke buku bentrok, untuk rentang dan ruangan yang dipakai rapat di file. */
export async function loadRoomBookings(ctx: Ctx, st: MasterState, ledger: Ledger, ranges: { roomId: string; s: Date; e: Date }[]) {
  const real = new Set([...st.M.rooms.values()].filter((r) => !r.isNew).map((r) => r.id));
  const list = ranges.filter((x) => real.has(x.roomId));
  if (!list.length) return;
  const minS = new Date(Math.min(...list.map((x) => x.s.getTime())));
  const maxE = new Date(Math.max(...list.map((x) => x.e.getTime())));
  const roomIds = [...new Set(list.map((x) => x.roomId))];
  const rows = await prisma.booking.findMany({
    where: { tenantId: ctx.u.tenantId, deletedAt: null, isOverride: false, resourceType: "ROOM", resourceId: { in: roomIds }, startsAt: { lt: maxE }, endsAt: { gt: minS } },
  });
  const evIds = [...new Set(rows.filter((b) => b.sourceType === "EVENT").map((b) => b.sourceId))];
  const rehIds = [...new Set(rows.filter((b) => b.sourceType === "REHEARSAL").map((b) => b.sourceId))];
  const [evRows, rehRows] = await Promise.all([
    evIds.length ? prisma.event.findMany({ where: { id: { in: evIds } }, select: { id: true, title: true, number: true } }) : [],
    rehIds.length ? prisma.rehearsalSession.findMany({ where: { id: { in: rehIds } }, select: { id: true, event: { select: { title: true } } } }) : [],
  ]);
  const evName = new Map(evRows.map((e) => [e.id, `${e.title} (${e.number})`]));
  const rehName = new Map(rehRows.map((x) => [x.id, `Latihan ${x.event.title}`]));
  for (const b of rows) {
    const name = (b.sourceType === "EVENT" ? evName.get(b.sourceId) : rehName.get(b.sourceId)) ?? "jadwal lain";
    ledger.add(`ROOM:${b.resourceId}`, b.startsAt, b.endsAt, `${name}, ${fmtRange(b.startsAt, b.endsAt)}`);
  }
}

/** Simpan rapat satu per satu (satu transaksi per rapat). Yang gagal ditandai, yang lain tetap jalan. */
export async function writeMeetings(ctx: Ctx, plan: Mtg[]) {
  const { rep, u } = ctx;
  for (const m of plan) {
    if (m.group.failed) { rep.fail("Rapat", m.row, `Kelompok ${m.group.name} gagal dibuat, jadi rapat ini tidak disimpan.`); continue; }
    try {
      const members = await prisma.groupMember.findMany({ where: { groupId: m.group.id, leftAt: null, person: { deletedAt: null } }, select: { personId: true } });
      const number = await nextDocNumber(u.tenantId, "RP", m.startsAt);
      await prisma.$transaction(
        async (tx) => {
          const data: Prisma.EventUncheckedCreateInput = {
            id: m.id, tenantId: u.tenantId, number, kind: "RAPAT", groupId: m.group.id, title: m.title, startsAt: m.startsAt, endsAt: m.endsAt, roomId: m.room.id,
            status: "PUBLISHED", publishedAt: new Date(), attendanceMode: "COUNT", createdById: u.userId, showTopic: m.showTopic, showAttendees: m.showAttendees,
            participants: { create: members.map((x) => ({ personId: x.personId, createdById: u.userId })) },
          };
          await tx.event.create({ data });
          await tx.booking.create({ data: { tenantId: u.tenantId, resourceType: "ROOM", resourceId: m.room.id, startsAt: m.startsAt, endsAt: m.endsAt, sourceType: "EVENT", sourceId: m.id } });
        },
        { timeout: 60_000, maxWait: 20_000 },
      );
    } catch (e) {
      const msg = /exclusion|23P01|booking_no_overlap/i.test(String((e as Error)?.message)) ? "Ruangan bentrok dengan data lain yang baru masuk." : `Gagal disimpan (${(e as Error)?.message?.split("\n").pop()?.slice(0, 160) ?? "kesalahan tidak dikenal"}).`;
      rep.fail("Rapat", m.row, msg);
    }
  }
}
