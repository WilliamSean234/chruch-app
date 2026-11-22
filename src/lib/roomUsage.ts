import { prisma } from "./prisma";
import { badRequest, notFound } from "./errors";
import { roomConflict } from "./booking";
import { DATE_RE, TIME_RE, zonedToUtc } from "./time";
import { meetingPublicTitle } from "./meetingLabel";

export type UsageItem = {
  kind: "EVENT" | "REHEARSAL"; eventId: string; title: string; number: string; status: string; seq: number | null; startsAt: string; endsAt: string;
  /** true = rapat kelompok: judul sudah disamarkan, dan tautannya ke /rapat bukan /jadwal. */
  meeting?: boolean;
};

/**
 * Pemakaian semua ruangan aktif pada satu tanggal (acara dan sesi latihan), diambil dari buku pemesanan ruangan.
 * `seeDrafts` false: acara yang belum terbit tetap menandai ruangan terpakai, tetapi judulnya disembunyikan (seperti di kalender).
 */
export async function roomUsage(tenantId: string, date: string, seeDrafts = true) {
  if (!DATE_RE.test(date)) throw badRequest("Format tanggal YYYY-MM-DD.");
  const dayStart = zonedToUtc(date, "00:00");
  const dayEnd = zonedToUtc(date, "23:59");

  const [rooms, bookings] = await Promise.all([
    prisma.room.findMany({ where: { tenantId, deletedAt: null }, orderBy: [{ floor: { sort: "asc", nulls: "last" } }, { name: "asc" }] }),
    prisma.booking.findMany({
      where: { tenantId, resourceType: "ROOM", deletedAt: null, startsAt: { lt: dayEnd }, endsAt: { gt: dayStart } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  const evIds = bookings.filter((b) => b.sourceType === "EVENT").map((b) => b.sourceId);
  const rhIds = bookings.filter((b) => b.sourceType === "REHEARSAL").map((b) => b.sourceId);
  const [events, rehearsals] = await Promise.all([
    prisma.event.findMany({ where: { id: { in: evIds } }, include: { group: { select: { name: true } } } }),
    prisma.rehearsalSession.findMany({ where: { id: { in: rhIds } }, include: { event: true } }),
  ]);
  const evById = new Map(events.map((e) => [e.id, e]));
  const rhById = new Map(rehearsals.map((r) => [r.id, r]));

  const hide = (it: UsageItem): UsageItem => (!seeDrafts && it.status === "DRAFT" && !it.meeting ? { ...it, title: "Acara (belum terbit)", number: "" } : it);
  const itemsFor = (roomId: string): UsageItem[] =>
    bookings.filter((b) => b.resourceId === roomId).flatMap((b): UsageItem[] => {
      if (b.sourceType === "EVENT") {
        const e = evById.get(b.sourceId);
        if (!e) return [];
        const meeting = e.kind === "RAPAT";
        return [{ kind: "EVENT", eventId: e.id, title: meeting ? meetingPublicTitle(e.group?.name ?? "", e.title, e.showTopic) : e.title, number: e.number, status: e.status, seq: null, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString(), meeting }];
      }
      const r = rhById.get(b.sourceId);
      return r ? [{ kind: "REHEARSAL", eventId: r.eventId, title: r.event.title, number: r.event.number, status: r.event.status, seq: r.seq, startsAt: b.startsAt.toISOString(), endsAt: b.endsAt.toISOString() }] : [];
    });

  return { date, rooms: rooms.filter((r) => r.isActive || bookings.some((b) => b.resourceId === r.id)).map((r) => ({ id: r.id, name: r.name, floor: r.floor, isActive: r.isActive, items: itemsFor(r.id).map(hide) })) };
}

/** Cek apakah satu ruangan kosong pada rentang jam tertentu. */
export async function roomAvailability(tenantId: string, q: { roomId: string; date: string; start: string; end: string }) {
  if (!DATE_RE.test(q.date) || !TIME_RE.test(q.start) || !TIME_RE.test(q.end)) throw badRequest("Tanggal atau jam tidak valid.");
  const startsAt = zonedToUtc(q.date, q.start);
  const endsAt = zonedToUtc(q.date, q.end);
  if (endsAt <= startsAt) throw badRequest("Jam selesai harus setelah jam mulai.");
  const room = await prisma.room.findFirst({ where: { id: q.roomId, tenantId, deletedAt: null } });
  if (!room) throw notFound("Ruangan");
  if (!room.isActive) return { available: false, roomName: room.name, conflicts: [] as string[], inactive: true };
  const busy = await roomConflict(tenantId, room.id, startsAt, endsAt);
  return { available: !busy, roomName: room.name, conflicts: busy ?? [], inactive: false };
}
