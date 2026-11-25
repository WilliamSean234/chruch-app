import { z } from "zod";
import { prisma } from "./prisma";
import { canSeeDraftEvents, teamScope, type AuthUser } from "./rbac";
import { pageOf, pagingQuery, resolvePaging } from "./paging";
import { localParts, zonedToUtc } from "./time";
import { teamKind } from "./seatRules";
import { checkEvent, overlappingBookings, RULE_BY_CODE, RULES, type RuleCode, type TimedBooking, type Violation } from "./eventRules";

export const violationQuery = z.object({
  rule: z.enum(["EBM_LUAR", "EBM_RANGKAP", "KURSI_EBM", "NO_BAND", "BENTROK", "BELUM_BISA"]).optional(),
  past: z.enum(["1"]).optional(), // sertakan acara yang sudah lewat
  ...pagingQuery,
});

const MAX_EVENTS = 600;

const fmt = (d: Date) => { const p = localParts(d); return `${p.date.slice(8)}/${p.date.slice(5, 7)} ${p.time}`; };

/**
 * Acara yang menyimpang dari aturan penjadwalan (lihat eventRules), berhalaman. Acara yang akan datang saja, kecuali `past`.
 * Admin Tim hanya melihat penyimpangan yang menyangkut timnya.
 */
export async function listViolations(u: AuthUser, q: z.infer<typeof violationQuery>) {
  const pg = resolvePaging(q);
  const today = zonedToUtc(localParts(new Date()).date, "00:00");
  const events = await prisma.event.findMany({
    where: { tenantId: u.tenantId, deletedAt: null, kind: "IBADAH", status: canSeeDraftEvents(u) ? { not: "CANCELLED" } : "PUBLISHED", ...(q.past ? {} : { startsAt: { gte: today } }) },
    include: { room: { select: { name: true } }, assignments: { include: { ministry: { include: { teamType: { select: { id: true, name: true } } } }, person: { select: { id: true, name: true } } } } },
    orderBy: { startsAt: q.past ? "desc" : "asc" },
    take: MAX_EVENTS,
  });

  // anggota EBM dan kemampuan tercatat semua orang yang bertugas
  const personIds = [...new Set(events.flatMap((e) => e.assignments.map((a) => a.personId).filter((x): x is string => !!x)))];
  const pms = personIds.length
    ? await prisma.personMinistry.findMany({
        where: { personId: { in: personIds }, ministry: { deletedAt: null } },
        select: { personId: true, ministryId: true, ministry: { select: { teamType: { select: { name: true } } } } },
      })
    : [];
  const ebm = new Set(pms.filter((r) => teamKind(r.ministry.teamType.name) === "EBM").map((r) => r.personId));
  const capable = new Set(pms.map((r) => `${r.personId}:${r.ministryId}`));

  const byEvent = new Map<string, Violation[]>();
  for (const e of events) {
    const seats = e.assignments.map((a) => ({
      personId: a.personId, personName: a.person?.name ?? null,
      ministryId: a.ministryId, ministryName: a.ministry.name, teamTypeId: a.ministry.teamType.id, teamName: a.ministry.teamType.name, bandOnly: a.ministry.bandOnly,
    }));
    const found = checkEvent({ bandMode: e.bandMode as "BAND" | "NO_BAND", seats }, { ebm, capable });
    if (found.length) byEvent.set(e.id, found);
  }

  // orang yang terjadwal di dua tempat pada jam yang sama
  if (personIds.length && events.length) {
    const minStart = new Date(Math.min(...events.map((e) => e.startsAt.getTime())));
    const maxEnd = new Date(Math.max(...events.map((e) => e.endsAt.getTime())));
    const bookings = await prisma.booking.findMany({
      where: { tenantId: u.tenantId, resourceType: "PERSON", deletedAt: null, resourceId: { in: personIds }, endsAt: { gt: minStart }, startsAt: { lt: maxEnd } },
      select: { id: true, resourceId: true, startsAt: true, endsAt: true, sourceType: true, sourceId: true },
    });
    const rehearsalIds = bookings.filter((b) => b.sourceType === "REHEARSAL").map((b) => b.sourceId);
    const sessions = rehearsalIds.length ? await prisma.rehearsalSession.findMany({ where: { id: { in: rehearsalIds } }, select: { id: true, eventId: true } }) : [];
    const sessionEvent = new Map(sessions.map((s) => [s.id, s.eventId]));
    const timed: TimedBooking[] = bookings.flatMap((b) => {
      const eventId = b.sourceType === "EVENT" ? b.sourceId : sessionEvent.get(b.sourceId);
      return eventId ? [{ id: b.id, personId: b.resourceId, startsAt: b.startsAt, endsAt: b.endsAt, kind: b.sourceType as "EVENT" | "REHEARSAL", eventId }] : [];
    });
    const pairs = overlappingBookings(timed);
    if (pairs.length) {
      const involved = [...new Set(pairs.flatMap(([a, b]) => [a.eventId, b.eventId]))];
      const info = new Map((await prisma.event.findMany({ where: { id: { in: involved } }, select: { id: true, title: true } })).map((e) => [e.id, e.title]));
      const names = new Map(events.flatMap((e) => e.assignments.filter((a) => a.person).map((a) => [a.personId!, a.person!.name] as const)));
      const label = (b: TimedBooking) => `${b.kind === "REHEARSAL" ? "latihan " : ""}${info.get(b.eventId) ?? "acara lain"} (${fmt(b.startsAt)})`;
      const seen = new Set<string>();
      for (const [a, b] of pairs) {
        const key = `${a.personId}|${[a.eventId, b.eventId].sort().join("|")}|${a.kind}${b.kind}`;
        if (seen.has(key)) continue;
        seen.add(key);
        for (const eid of new Set([a.eventId, b.eventId])) {
          const ev = events.find((x) => x.id === eid);
          if (!ev) continue; // acara di luar daftar (mis. sudah lewat)
          const mine = ev.assignments.filter((s) => s.personId === a.personId);
          byEvent.set(eid, [...(byEvent.get(eid) ?? []), {
            code: "BENTROK", severity: "ATURAN", teamTypeIds: [...new Set(mine.map((s) => s.ministry.teamType.id))],
            message: `${names.get(a.personId) ?? "Seseorang"} terjadwal di dua tempat pada jam yang sama: ${label(a)} dan ${label(b)}.`,
          }]);
        }
      }
    }
  }

  // Admin Tim: hanya penyimpangan yang menyangkut timnya
  const scope = teamScope(u);
  const visible = new Map<string, Violation[]>();
  for (const [id, list] of byEvent) {
    const mine = scope === null ? list : list.filter((x) => x.teamTypeIds.some((t) => scope.includes(t)));
    if (mine.length) visible.set(id, mine);
  }

  const counts = new Map<RuleCode, number>();
  for (const list of visible.values()) for (const c of new Set(list.map((x) => x.code))) counts.set(c, (counts.get(c) ?? 0) + 1);

  const shown = events
    .filter((e) => visible.has(e.id))
    .map((e) => ({ e, list: (visible.get(e.id) ?? []).filter((x) => !q.rule || x.code === q.rule) }))
    .filter((x) => x.list.length > 0);
  const items = shown.slice(pg.skip, pg.skip + pg.take).map(({ e, list }) => ({
    id: e.id, number: e.number, title: e.title, status: e.status, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(), room: e.room.name,
    violations: list.map((x) => ({ code: x.code, label: RULE_BY_CODE.get(x.code)!.label, severity: x.severity, message: x.message })),
  }));
  return {
    ...pageOf(items, shown.length, pg),
    options: { rules: RULES.map((r) => ({ code: r.code, label: r.label, severity: r.severity, hint: r.hint, events: counts.get(r.code) ?? 0 })) },
    truncated: events.length >= MAX_EVENTS,
  };
}
