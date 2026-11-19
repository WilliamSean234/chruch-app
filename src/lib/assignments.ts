import { z } from "zod";
import { prisma } from "./prisma";
import { ApiError, conflict, notFound } from "./errors";
import { personConflicts, rangesOverlap, releaseBookings, translateOverlap, type Range } from "./booking";
import { isEditable } from "./eventStatusFlow";
import { audit } from "./audit";
import { getEvent } from "./events";
import { can, requirePermission, requireTeamAccess, type AuthUser } from "./rbac";
import { nameKey } from "./names";

export const assignBody = z.object({
  personId: z.string().uuid().nullable(), // null = kosongkan kursi
  override: z.object({ reason: z.string().trim().min(5, "Alasan override minimal 5 karakter").max(300) }).optional(),
});

async function loadSeat(u: AuthUser, eventId: string, assignmentId: string) {
  const seat = await prisma.eventAssignment.findFirst({ where: { id: assignmentId, eventId, tenantId: u.tenantId }, include: { ministry: true, event: true } });
  if (!seat) throw notFound("Kursi");
  requireTeamAccess(u, seat.teamTypeId); // Admin Tim hanya tim miliknya
  return seat;
}

/** Waktu yang dipakai seorang pelayan di kursi ini: acara, plus sesi latihan bila kursinya wajib latihan. */
async function seatRanges(seat: { eventId: string; rehearsalRequired: boolean; event: { startsAt: Date; endsAt: Date } }) {
  const ranges: (Range & { sourceType: "EVENT" | "REHEARSAL"; sourceId: string })[] = [
    { startsAt: seat.event.startsAt, endsAt: seat.event.endsAt, sourceType: "EVENT", sourceId: seat.eventId },
  ];
  if (seat.rehearsalRequired) {
    const rs = await prisma.rehearsalSession.findMany({ where: { eventId: seat.eventId, deletedAt: null }, orderBy: { seq: "asc" } });
    for (const r of rs) ranges.push({ startsAt: r.startsAt, endsAt: r.endsAt, sourceType: "REHEARSAL", sourceId: r.id });
  }
  return ranges;
}

/**
 * Isi atau kosongkan satu kursi.
 * Bentrok = diblokir (409 PERSON_CONFLICT). Hanya Superadmin yang boleh menembus dengan alasan, dan itu dicatat di audit log.
 */
export async function assignPerson(u: AuthUser, eventId: string, assignmentId: string, body: z.infer<typeof assignBody>) {
  const seat = await loadSeat(u, eventId, assignmentId);
  if (!isEditable(seat.event.status)) throw conflict("Acara yang sudah dibatalkan tidak bisa diubah.");

  if (body.personId === null) {
    await prisma.$transaction(async (tx) => {
      await releaseBookings(tx, { assignmentId });
      await tx.eventAssignment.update({ where: { id: assignmentId }, data: { personId: null } });
    });
    return { event: await getEvent(u.tenantId, eventId), warnings: [] as string[] };
  }

  const [person, ranges, capable] = await Promise.all([
    prisma.person.findFirst({ where: { id: body.personId, tenantId: u.tenantId, deletedAt: null } }),
    seatRanges(seat),
    prisma.personMinistry.count({ where: { personId: body.personId, ministryId: seat.ministryId } }),
  ]);
  if (!person) throw notFound("Orang");
  if (seat.personId === person.id) return { event: await getEvent(u.tenantId, eventId), warnings: [] as string[] };

  const found = (await personConflicts(u.tenantId, [person.id], ranges, { excludeAssignmentId: assignmentId, currentEventId: eventId })).get(person.id) ?? [];

  if (found.length) {
    if (!body.override) {
      throw new ApiError(409, "PERSON_CONFLICT", `${person.name} sudah terjadwal di tempat lain pada jam itu: ${found.map((c) => c.label).join("; ")}.`, {
        conflicts: found.map((c) => ({ label: c.label, startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString(), sameEvent: c.sameEvent })),
        canOverride: can(u, "booking.override"),
      });
    }
    requirePermission(u, "booking.override");
  }

  await translateOverlap(
    () =>
      prisma.$transaction(async (tx) => {
        await releaseBookings(tx, { assignmentId });
        await tx.eventAssignment.update({ where: { id: assignmentId }, data: { personId: person.id } });
        await tx.booking.createMany({
          data: ranges.map((r) => ({
            tenantId: u.tenantId, resourceType: "PERSON", resourceId: person.id, startsAt: r.startsAt, endsAt: r.endsAt,
            sourceType: r.sourceType, sourceId: r.sourceId, assignmentId,
            isOverride: found.some((c) => rangesOverlap(c, r)), // hanya jam yang memang bentrok yang ditandai override
          })),
        });
      }),
    `${person.name} baru saja dijadwalkan di tempat lain pada jam itu. Muat ulang lalu coba lagi.`,
  );

  if (found.length && body.override) {
    await audit({
      tenantId: u.tenantId, userId: u.userId, action: "booking.override", entity: "EventAssignment", entityId: assignmentId, reason: body.override.reason,
      payload: { eventId, personId: person.id, personName: person.name, conflicts: found.map((c) => c.label) },
    });
  }

  const warnings: string[] = [];
  if (!capable) warnings.push(`${person.name} belum tercatat bisa ${seat.ministry.name}.`);
  return { event: await getEvent(u.tenantId, eventId), warnings };
}

/**
 * Saran orang untuk satu kursi: yang punya kemampuan posisi itu, dipisah tersedia / tidak tersedia (beserta alasannya).
 * `includeOthers` menambahkan orang lain yang belum tercatat bisa posisi tersebut.
 */
type MinistryLite = { id: string; name: string; sortOrder: number; deletedAt: Date | null; teamType: { name: string; sortOrder: number } };
/** Daftar pelayanan satu orang, dikelompokkan per tim: bahan pertimbangan saat memetakan orang ke posisi. */
function servicesOf(list: MinistryLite[], seatMinistryId: string) {
  const byTeam = new Map<string, { team: string; order: number; items: { name: string; order: number; current: boolean }[] }>();
  for (const m of list.filter((x) => !x.deletedAt)) {
    const g = byTeam.get(m.teamType.name) ?? { team: m.teamType.name, order: m.teamType.sortOrder, items: [] };
    g.items.push({ name: m.name, order: m.sortOrder, current: m.id === seatMinistryId });
    byTeam.set(m.teamType.name, g);
  }
  return [...byTeam.values()]
    .sort((a, b) => a.order - b.order || a.team.localeCompare(b.team))
    .map((g) => ({ team: g.team, items: g.items.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)).map((i) => ({ name: i.name, current: i.current })) }));
}

export async function suggestForSeat(u: AuthUser, eventId: string, assignmentId: string, q: { search?: string; includeOthers: boolean }) {
  const seat = await loadSeat(u, eventId, assignmentId);
  const ranges = await seatRanges(seat);

  const people = await prisma.person.findMany({
    where: {
      tenantId: u.tenantId, deletedAt: null,
      ...(q.search ? { nameKey: { contains: nameKey(q.search) } } : {}),
      ...(q.includeOthers ? {} : { ministries: { some: { ministryId: seat.ministryId } } }),
    },
    include: { ministries: { select: { ministryId: true, ministry: { select: { id: true, name: true, sortOrder: true, deletedAt: true, teamType: { select: { name: true, sortOrder: true } } } } } } },
    orderBy: { nameKey: "asc" },
    take: 200,
  });
  const conflicts = await personConflicts(u.tenantId, people.map((p) => p.id), ranges, { excludeAssignmentId: assignmentId, currentEventId: eventId });

  const rows = people.map((p) => ({
    id: p.id, name: p.name, title: p.title,
    services: servicesOf(p.ministries.map((m) => m.ministry), seat.ministryId),
    capable: p.ministries.some((m) => m.ministryId === seat.ministryId),
    isCurrent: seat.personId === p.id,
    conflicts: (conflicts.get(p.id) ?? []).map((c) => c.label),
  }));
  const sortCapableFirst = (a: (typeof rows)[number], b: (typeof rows)[number]) => Number(b.capable) - Number(a.capable);
  return {
    seat: { id: seat.id, ministryId: seat.ministryId, ministry: seat.ministry.name, slotNo: seat.slotNo, rehearsalRequired: seat.rehearsalRequired },
    available: rows.filter((r) => r.conflicts.length === 0).sort(sortCapableFirst),
    unavailable: rows.filter((r) => r.conflicts.length > 0).sort(sortCapableFirst),
  };
}
