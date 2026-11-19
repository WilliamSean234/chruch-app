import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { badRequest, conflict, notFound } from "./errors";
import { addMinutes, DATE_RE, localParts, TIME_RE, zonedToUtc } from "./time";
import { assertRoomFree, assertRoomUsable, bookRoom, releaseBookings, translateOverlap } from "./booking";
import { nextDocNumber } from "./docNumber";
import { creatorNames } from "./creators";
import { assertTransition, isEditable } from "./eventStatusFlow";
import type { AuthUser } from "./rbac";
import { pageOf, pagingQuery, resolvePaging } from "./paging";

const seatSpec = z.object({ ministryId: z.string().uuid(), count: z.number().int().min(1).max(10).default(1), rehearsalRequired: z.boolean().optional() });

export const eventCreateBody = z.object({
  title: z.string().trim().min(1).max(120),
  date: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE),
  durationMin: z.number().int().min(15).max(720).default(120),
  roomId: z.string().uuid(),
  attendanceMode: z.enum(["COUNT", "NAMES"]).default("COUNT"),
  teamTypeIds: z.array(z.string().uuid()).default([]), // tim kosong tanpa kursi, mis. "Bagi roti & anggur"
  seats: z.array(seatSpec).default([]),
});

export const eventUpdateBody = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  date: z.string().regex(DATE_RE).optional(),
  startTime: z.string().regex(TIME_RE).optional(),
  durationMin: z.number().int().min(15).max(720).optional(),
  roomId: z.string().uuid().optional(),
  attendanceMode: z.enum(["COUNT", "NAMES"]).optional(),
});

export const seatBody = seatSpec;
export const teamBody = z.object({ teamTypeId: z.string().uuid() });

const include = {
  room: true,
  teams: { include: { teamType: true } },
  assignments: { include: { ministry: true, person: true }, orderBy: [{ sortOrder: "asc" }, { slotNo: "asc" }] },
  rehearsals: { where: { deletedAt: null }, include: { room: true }, orderBy: { seq: "asc" } },
} satisfies Prisma.EventInclude;
type EventFull = Prisma.EventGetPayload<{ include: typeof include }>;

export const toDto = (e: EventFull) => ({
  id: e.id, number: e.number, title: e.title, status: e.status, attendanceMode: e.attendanceMode,
  startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(),
  durationMin: Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000),
  room: { id: e.room.id, name: e.room.name },
  templateId: e.templateId,
  teams: e.teams.map((t) => ({ teamTypeId: t.teamTypeId, name: t.teamType.name })),
  seats: e.assignments.map((a) => ({
    id: a.id, teamTypeId: a.teamTypeId, ministryId: a.ministryId, ministryName: a.ministry.name, slotNo: a.slotNo,
    label: a.slotNo > 1 || e.assignments.filter((x) => x.ministryId === a.ministryId).length > 1 ? `${a.ministry.name} ${a.slotNo}` : a.ministry.name,
    rehearsalRequired: a.rehearsalRequired,
    person: a.person ? { id: a.person.id, name: a.person.name, origin: a.person.origin, originChurch: a.person.originChurch } : null,
  })),
  rehearsals: e.rehearsals.map((r) => ({ id: r.id, seq: r.seq, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), room: { id: r.room.id, name: r.room.name }, note: r.note })),
});

async function load(tenantId: string, id: string) {
  const e = await prisma.event.findFirst({ where: { id, tenantId, deletedAt: null, kind: "IBADAH" }, include });
  if (!e) throw notFound("Acara");
  return e;
}
export const getEvent = async (tenantId: string, id: string) => {
  const e = await load(tenantId, id);
  const names = await creatorNames([e.createdById]);
  return { ...toDto(e), createdBy: (e.createdById && names.get(e.createdById)) || null, createdAt: e.createdAt.toISOString() };
};

async function loadEditable(tenantId: string, id: string) {
  const e = await load(tenantId, id);
  if (!isEditable(e.status)) throw conflict("Acara yang sudah dibatalkan tidak bisa diubah.");
  return e;
}

export const eventListQuery = z.object({
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).optional(),
  templateId: z.union([z.string().uuid(), z.literal("NONE")]).optional(), // NONE = acara satu kali (bukan dari template)
  roomId: z.string().uuid().optional(), // ruangan acara, atau ruangan salah satu sesi latihannya
  rehearsal: z.enum(["YES", "NO"]).optional(), // sudah / belum punya sesi latihan
  search: z.string().trim().max(80).optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
  ...pagingQuery,
});

/** Daftar acara ibadah berhalaman, lengkap dengan sesi latihan yang sudah dibentuk dan pilihan filter. */
export async function listEvents(tenantId: string, q: z.infer<typeof eventListQuery>) {
  const pg = resolvePaging(q);
  const and: Prisma.EventWhereInput[] = [];
  if (q.roomId) and.push({ OR: [{ roomId: q.roomId }, { rehearsals: { some: { roomId: q.roomId, deletedAt: null } } }] });
  if (q.search) and.push({ OR: [{ title: { contains: q.search, mode: "insensitive" } }, { number: { contains: q.search, mode: "insensitive" } }] });
  const where: Prisma.EventWhereInput = {
    tenantId, deletedAt: null, kind: "IBADAH",
    ...(q.status ? { status: q.status } : {}),
    ...(q.templateId ? { templateId: q.templateId === "NONE" ? null : q.templateId } : {}),
    ...(q.rehearsal === "YES" ? { rehearsals: { some: { deletedAt: null } } } : {}),
    ...(q.rehearsal === "NO" ? { rehearsals: { none: { deletedAt: null } } } : {}),
    ...(q.from || q.to ? { startsAt: { ...(q.from ? { gte: zonedToUtc(q.from, "00:00") } : {}), ...(q.to ? { lte: zonedToUtc(q.to, "23:59") } : {}) } } : {}),
    ...(and.length ? { AND: and } : {}),
  };
  const [total, rows, templates, rooms] = await Promise.all([
    prisma.event.count({ where }),
    prisma.event.findMany({
      where,
      include: {
        room: true, template: { select: { name: true } },
        assignments: { select: { personId: true } },
        rehearsals: { where: { deletedAt: null }, include: { room: true }, orderBy: { seq: "asc" } },
      },
      orderBy: { startsAt: q.order },
      skip: pg.skip, take: pg.take,
    }),
    prisma.eventTemplate.findMany({ where: { tenantId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.room.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ floor: { sort: "asc", nulls: "last" } }, { name: "asc" }], select: { id: true, name: true, floor: true } }),
  ]);
  const names = await creatorNames(rows.map((e) => e.createdById));
  const items = rows.map((e) => ({
    id: e.id, number: e.number, title: e.title, status: e.status, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(),
    templateId: e.templateId, templateName: e.template?.name ?? null,
    createdBy: (e.createdById && names.get(e.createdById)) || null,
    room: { id: e.room.id, name: e.room.name, floor: e.room.floor },
    seatsTotal: e.assignments.length, seatsFilled: e.assignments.filter((a) => a.personId).length,
    rehearsals: e.rehearsals.map((r) => ({ id: r.id, seq: r.seq, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), room: { id: r.room.id, name: r.room.name, floor: r.room.floor }, note: r.note })),
  }));
  return { ...pageOf(items, total, pg), options: { templates, rooms } };
}

async function expandSeats(tenantId: string, seats: z.infer<typeof seatSpec>[]) {
  const ids = seats.map((s) => s.ministryId);
  if (new Set(ids).size !== ids.length) throw badRequest("Satu posisi cukup satu baris; pakai count untuk jumlah kursi.");
  const ms = await prisma.ministry.findMany({ where: { id: { in: ids }, tenantId, deletedAt: null } });
  if (ms.length !== ids.length) throw badRequest("Ada posisi pelayanan yang tidak valid.");
  const byId = new Map(ms.map((m) => [m.id, m]));
  return seats.flatMap((s) => {
    const m = byId.get(s.ministryId)!;
    return Array.from({ length: s.count }, (_, i) => ({ ministryId: m.id, teamTypeId: m.teamTypeId, slotNo: i + 1, rehearsalRequired: s.rehearsalRequired ?? m.rehearsalRequiredDefault }));
  });
}

/** Acara satu kali (tidak dari template). */
export async function createEvent(u: AuthUser, b: z.infer<typeof eventCreateBody>) {
  await assertRoomUsable(u.tenantId, b.roomId);
  const startsAt = zonedToUtc(b.date, b.startTime);
  const endsAt = addMinutes(startsAt, b.durationMin);
  await assertRoomFree(u.tenantId, b.roomId, startsAt, endsAt);
  const seats = await expandSeats(u.tenantId, b.seats);
  const teamIds = [...new Set([...b.teamTypeIds, ...seats.map((s) => s.teamTypeId)])];
  if (teamIds.length && (await prisma.teamType.count({ where: { id: { in: teamIds }, tenantId: u.tenantId, deletedAt: null } })) !== teamIds.length) throw badRequest("Ada tim yang tidak valid.");

  const number = await nextDocNumber(u.tenantId, "EV", startsAt);
  const created = await translateOverlap(() =>
    prisma.$transaction(async (tx) => {
      const e = await tx.event.create({
        data: {
          tenantId: u.tenantId, number, title: b.title, startsAt, endsAt, roomId: b.roomId, status: "DRAFT", attendanceMode: b.attendanceMode, createdById: u.userId,
          teams: { create: teamIds.map((teamTypeId) => ({ teamTypeId })) },
          assignments: { create: seats.map((s, i) => ({ tenantId: u.tenantId, ...s, sortOrder: i })) },
        },
      });
      await bookRoom(tx, { tenantId: u.tenantId, roomId: b.roomId, startsAt, endsAt, sourceType: "EVENT", sourceId: e.id });
      return e;
    }),
  );
  return getEvent(u.tenantId, created.id);
}

/** Ubah judul, waktu, ruangan, atau mode kehadiran. Pemakaian ruangan dan orang ikut dipindah. */
export async function updateEvent(u: AuthUser, id: string, b: z.infer<typeof eventUpdateBody>) {
  const cur = await loadEditable(u.tenantId, id);

  const was = localParts(cur.startsAt);
  const curDuration = Math.round((cur.endsAt.getTime() - cur.startsAt.getTime()) / 60_000);
  const startsAt = zonedToUtc(b.date ?? was.date, b.startTime ?? was.time);
  const endsAt = addMinutes(startsAt, b.durationMin ?? curDuration);
  const roomId = b.roomId ?? cur.roomId;
  const timeChanged = startsAt.getTime() !== cur.startsAt.getTime() || endsAt.getTime() !== cur.endsAt.getTime();
  const roomChanged = roomId !== cur.roomId;

  if (b.attendanceMode && b.attendanceMode !== cur.attendanceMode) {
    const [names, summary] = await Promise.all([prisma.eventAttendance.count({ where: { eventId: id } }), prisma.eventAttendanceSummary.count({ where: { eventId: id } })]);
    if (names + summary > 0) throw conflict("Mode kehadiran tidak bisa diganti karena data kehadiran sudah ada.");
  }
  if (roomChanged) await assertRoomUsable(u.tenantId, roomId);
  if (timeChanged || roomChanged) await assertRoomFree(u.tenantId, roomId, startsAt, endsAt, id);

  await translateOverlap(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.event.update({ where: { id }, data: { title: b.title, attendanceMode: b.attendanceMode, startsAt, endsAt, roomId } });
        if (timeChanged || roomChanged) {
          await releaseBookings(tx, { sourceType: "EVENT", sourceId: id, resourceType: "ROOM" });
          await bookRoom(tx, { tenantId: u.tenantId, roomId, startsAt, endsAt, sourceType: "EVENT", sourceId: id });
        }
        if (timeChanged) {
          // orang yang sudah dijadwalkan ikut pindah jam; bila ada yang bentrok, seluruh perubahan dibatalkan
          await tx.booking.updateMany({ where: { sourceType: "EVENT", sourceId: id, resourceType: "PERSON", deletedAt: null }, data: { startsAt, endsAt } });
        }
      }),
    "Waktu baru bentrok: ada pelayan di acara ini yang sudah terjadwal di tempat lain pada jam itu, atau ruangan terpakai.",
  );
  return getEvent(u.tenantId, id);
}

export async function addTeam(u: AuthUser, eventId: string, teamTypeId: string) {
  await loadEditable(u.tenantId, eventId);
  if (!(await prisma.teamType.count({ where: { id: teamTypeId, tenantId: u.tenantId, deletedAt: null } }))) throw notFound("Tim");
  if (await prisma.eventTeam.count({ where: { eventId, teamTypeId } })) throw conflict("Tim ini sudah ada di acara.");
  await prisma.eventTeam.create({ data: { eventId, teamTypeId } });
  return getEvent(u.tenantId, eventId);
}

/** Hapus tim dari acara beserta semua kursinya; pemakaian orang di kursi itu dilepas. */
export async function removeTeam(u: AuthUser, eventId: string, teamTypeId: string) {
  await loadEditable(u.tenantId, eventId);
  const seats = await prisma.eventAssignment.findMany({ where: { eventId, teamTypeId }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    if (seats.length) await releaseBookings(tx, { assignmentId: { in: seats.map((s) => s.id) } });
    await tx.eventAssignment.deleteMany({ where: { eventId, teamTypeId } });
    await tx.eventTeam.deleteMany({ where: { eventId, teamTypeId } });
  });
  return getEvent(u.tenantId, eventId);
}

/** Tambah kursi (mis. Gitar 2). Tim induknya otomatis ikut ditambahkan ke acara. */
export async function addSeats(u: AuthUser, eventId: string, b: z.infer<typeof seatSpec>) {
  await loadEditable(u.tenantId, eventId);
  const m = await prisma.ministry.findFirst({ where: { id: b.ministryId, tenantId: u.tenantId, deletedAt: null } });
  if (!m) throw notFound("Posisi pelayanan");
  await prisma.$transaction(async (tx) => {
    const last = await tx.eventAssignment.aggregate({ where: { eventId, ministryId: m.id }, _max: { slotNo: true } });
    const order = await tx.eventAssignment.aggregate({ where: { eventId }, _max: { sortOrder: true } });
    const start = (last._max.slotNo ?? 0) + 1;
    const o = (order._max.sortOrder ?? -1) + 1;
    if (!(await tx.eventTeam.count({ where: { eventId, teamTypeId: m.teamTypeId } }))) await tx.eventTeam.create({ data: { eventId, teamTypeId: m.teamTypeId } });
    await tx.eventAssignment.createMany({
      data: Array.from({ length: b.count }, (_, i) => ({
        tenantId: u.tenantId, eventId, teamTypeId: m.teamTypeId, ministryId: m.id, slotNo: start + i, sortOrder: o + i, rehearsalRequired: b.rehearsalRequired ?? m.rehearsalRequiredDefault,
      })),
    });
  });
  return getEvent(u.tenantId, eventId);
}

export async function removeSeat(u: AuthUser, eventId: string, assignmentId: string) {
  await loadEditable(u.tenantId, eventId);
  const seat = await prisma.eventAssignment.findFirst({ where: { id: assignmentId, eventId, tenantId: u.tenantId } });
  if (!seat) throw notFound("Kursi");
  await prisma.$transaction(async (tx) => {
    await releaseBookings(tx, { assignmentId });
    await tx.eventAssignment.delete({ where: { id: assignmentId } });
  });
  return getEvent(u.tenantId, eventId);
}

export { assertTransition };
