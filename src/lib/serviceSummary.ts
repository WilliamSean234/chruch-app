import { prisma } from "./prisma";
import { zonedToUtc } from "./time";
import { can, canSeeDraftEvents, isSuperadmin, teamScope, type AuthUser } from "./rbac";

export type SummaryLevel = "all" | "team" | "self";

const fullName = (p: { name: string; title: string | null }) => (p.title && !p.name.toLowerCase().startsWith(p.title.toLowerCase()) ? `${p.title} ${p.name}` : p.name);

/**
 * Rekap pelayanan per orang dalam satu bulan (latihan tidak dihitung; satu kursi di satu acara = satu pelayanan).
 * - all  : Superadmin, Penjadwal (dan Admin Tim tanpa batas tim) melihat semua orang, acara draf ikut dihitung.
 * - team : Admin Tim hanya melihat pelayanan di tim yang ia kelola.
 * - self : selain itu hanya melihat dirinya sendiri, dan hanya acara yang sudah terbit.
 */
export async function serviceSummary(u: AuthUser, q: { month: string; teamTypeId?: string }) {
  const [y, m] = q.month.split("-").map(Number);
  const from = `${q.month}-01`;
  const to = `${q.month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const scope = teamScope(u);
  const level: SummaryLevel =
    isSuperadmin(u) || can(u, "event.write") || (can(u, "assignment.write") && scope === null) ? "all" : can(u, "assignment.write") && scope && scope.length ? "team" : "self";

  const empty = { level, from, to, totalServices: 0, people: [] as never[], idle: [] as never[] };
  if (level === "self" && !u.personId) return { ...empty, note: "Akun ini belum dihubungkan ke data orang." };

  let teamIds: string[] | null = null; // null = semua tim
  if (level === "team") teamIds = q.teamTypeId && scope!.includes(q.teamTypeId) ? [q.teamTypeId] : scope!;
  else if (level === "all" && q.teamTypeId) teamIds = [q.teamTypeId];
  const statuses = level === "self" || !canSeeDraftEvents(u) ? ["PUBLISHED"] : ["DRAFT", "PUBLISHED"]; // draf hanya untuk yang mengatur acara

  const seats = await prisma.eventAssignment.findMany({
    where: {
      tenantId: u.tenantId,
      personId: level === "self" ? u.personId! : { not: null },
      ...(teamIds ? { teamTypeId: { in: teamIds } } : {}),
      event: { deletedAt: null, status: { in: statuses }, startsAt: { gte: zonedToUtc(from, "00:00"), lte: zonedToUtc(to, "23:59") } },
    },
    select: {
      slotNo: true, ministry: { select: { name: true } }, person: { select: { id: true, name: true, title: true } },
      event: { select: { id: true, title: true, startsAt: true, status: true } },
    },
    orderBy: { event: { startsAt: "asc" } },
  });

  type Row = { id: string; name: string; services: { eventId: string; startsAt: string; title: string; seat: string; status: string }[] };
  const byPerson = new Map<string, Row>();
  for (const s of seats) {
    if (!s.person) continue;
    const row: Row = byPerson.get(s.person.id) ?? { id: s.person.id, name: fullName(s.person), services: [] };
    row.services.push({ eventId: s.event.id, startsAt: s.event.startsAt.toISOString(), title: s.event.title, seat: s.slotNo > 1 ? `${s.ministry.name} ${s.slotNo}` : s.ministry.name, status: s.event.status });
    byPerson.set(s.person.id, row);
  }
  // Pelayanan yang mampu dilakukan tiap orang (daftar di kanan nama, juga bahan dialog drag & drop).
  // Dibatasi ke tim yang boleh dilihat (Admin Tim), tetapi TIDAK ikut filter tim di layar.
  const canWhere = { deletedAt: null, ...(level === "team" ? { teamTypeId: { in: scope! } } : {}) };
  type CanInfo = { can: string[]; ministryIds: string[] };
  const canOf = new Map<string, CanInfo>();
  if (level !== "self" && byPerson.size > 0) {
    const pm = await prisma.personMinistry.findMany({
      where: { personId: { in: [...byPerson.keys()] }, ministry: canWhere },
      select: { personId: true, ministry: { select: { id: true, name: true, sortOrder: true, teamType: { select: { sortOrder: true } } } } },
    });
    pm.sort((a, b) => a.ministry.teamType.sortOrder - b.ministry.teamType.sortOrder || a.ministry.sortOrder - b.ministry.sortOrder || a.ministry.name.localeCompare(b.ministry.name, "id"));
    for (const x of pm) {
      const c = canOf.get(x.personId) ?? { can: [], ministryIds: [] };
      c.can.push(x.ministry.name); c.ministryIds.push(x.ministry.id);
      canOf.set(x.personId, c);
    }
  }
  const people = [...byPerson.values()]
    .map((p) => ({ ...p, ...(canOf.get(p.id) ?? { can: [] as string[], ministryIds: [] as string[] }), count: p.services.length, drafts: p.services.filter((x) => x.status === "DRAFT").length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "id"));

  // Orang yang bisa melayani tapi belum kebagian bulan ini (hanya untuk pengatur jadwal)
  let idle: { id: string; name: string; can: string[]; ministryIds: string[] }[] = [];
  if (level !== "self") {
    const ministryWhere = { deletedAt: null, ...(teamIds ? { teamTypeId: { in: teamIds } } : {}) };
    const rows = await prisma.person.findMany({
      where: { tenantId: u.tenantId, deletedAt: null, id: { notIn: [...byPerson.keys()] }, ministries: { some: { ministry: ministryWhere } } },
      select: {
        id: true, name: true, title: true,
        ministries: { where: { ministry: canWhere }, select: { ministry: { select: { id: true, name: true, sortOrder: true, teamType: { select: { sortOrder: true } } } } } },
      },
      orderBy: { name: "asc" },
      take: 300,
    });
    idle = rows.map((p) => {
      const ms = p.ministries.map((x) => x.ministry).sort((a, b) => a.teamType.sortOrder - b.teamType.sortOrder || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "id"));
      return { id: p.id, name: fullName(p), can: ms.map((m) => m.name), ministryIds: ms.map((m) => m.id) };
    });
  }

  return { level, from, to, totalServices: seats.length, people, idle };
}
