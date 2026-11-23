import { prisma } from "./prisma";
import { conflict, notFound } from "./errors";
import { notifyUsers, userIdsForPersons } from "./notify";
import { seatInAudience, STAFF_AUDIENCES, type StaffAudience } from "./notifyAudience";
import { dayShort, hm } from "./ui";
import type { AuthUser } from "./rbac";

const PREFIX = (eventId: string) => `diberitahu:${eventId}:`;

async function loadEvent(tenantId: string, eventId: string) {
  const e = await prisma.event.findFirst({
    where: { id: eventId, tenantId, deletedAt: null, kind: "IBADAH" },
    include: {
      room: { select: { name: true } },
      rehearsals: { where: { deletedAt: null }, orderBy: { seq: "asc" }, select: { startsAt: true } },
      assignments: { where: { personId: { not: null } }, include: { ministry: { select: { name: true, teamType: { select: { name: true } } } } }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!e) throw notFound("Acara");
  return e;
}
type LoadedEvent = Awaited<ReturnType<typeof loadEvent>>;

/** Orang yang punya kursi di acara ini untuk satu kelompok penerima, beserta posisinya. */
function peopleFor(e: LoadedEvent, audience: StaffAudience) {
  const out = new Map<string, { positions: string[]; rehearsal: boolean }>();
  for (const s of e.assignments) {
    if (!s.personId || !seatInAudience(audience, s.ministry.teamType.name, s.ministry.name)) continue;
    const cur = out.get(s.personId) ?? { positions: [], rehearsal: false };
    if (!cur.positions.includes(s.ministry.name)) cur.positions.push(s.ministry.name);
    cur.rehearsal ||= s.rehearsalRequired;
    out.set(s.personId, cur);
  }
  return out;
}

const when = (e: { startsAt: Date; endsAt: Date }) => `${dayShort(e.startsAt)}, ${hm(e.startsAt)}–${hm(e.endsAt)}`;

/** Ringkasan untuk dialog: berapa orang per kelompok, berapa yang bisa dijangkau, dan kapan terakhir dikirim. */
export async function staffNotifyInfo(u: AuthUser, eventId: string) {
  const e = await loadEvent(u.tenantId, eventId);
  const per = STAFF_AUDIENCES.map((a) => ({ audience: a.value, people: peopleFor(e, a.value) }));
  const all = new Set(per.flatMap((p) => [...p.people.keys()]));
  const accounts = await userIdsForPersons(u.tenantId, [...all]);
  const devices = accounts.size
    ? await prisma.pushSubscription.findMany({ where: { userId: { in: [...accounts.values()] } }, select: { userId: true }, distinct: ["userId"] })
    : [];
  const withDevice = new Set(devices.map((d) => d.userId));
  const reachable = (ids: string[]) => ids.filter((pid) => { const uid = accounts.get(pid); return !!uid && withDevice.has(uid); }).length;
  const last = await prisma.notificationLog.findFirst({ where: { tenantId: u.tenantId, kind: "PELAYAN_DIBERITAHU", dedupeKey: { startsWith: PREFIX(eventId) } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  return {
    status: e.status,
    ended: e.endsAt.getTime() < Date.now(),
    audiences: per.map((p) => ({ audience: p.audience, people: p.people.size, reachable: reachable([...p.people.keys()]) })),
    lastSentAt: last?.createdAt.toISOString() ?? null,
  };
}

/** Kirim pemberitahuan jadwal ke pelayan di acara yang sudah terbit. Tiap orang menerima satu pesan berisi posisinya. */
export async function sendStaffNotice(u: AuthUser, eventId: string, audience: StaffAudience) {
  const e = await loadEvent(u.tenantId, eventId);
  if (e.status !== "PUBLISHED") throw conflict("Hanya acara yang sudah terbit yang bisa diberitahukan ke pelayan. Terbitkan jadwalnya dulu.");
  if (e.endsAt.getTime() < Date.now()) throw conflict("Acara ini sudah selesai.");
  const people = peopleFor(e, audience);
  if (people.size === 0) throw conflict("Belum ada pelayan yang terjadwal untuk kelompok ini di acara tersebut.");

  const accounts = await userIdsForPersons(u.tenantId, [...people.keys()]);
  const rehearsals = e.rehearsals.slice(0, 3).map((r) => `${dayShort(r.startsAt)} ${hm(r.startsAt)}`).join("; ");
  const stamp = Date.now();
  const out = { total: people.size, sent: 0, noAccount: 0, noDevice: 0, off: 0, failed: 0 };

  const entries = [...people.entries()];
  for (let i = 0; i < entries.length; i += 5) {
    await Promise.all(entries.slice(i, i + 5).map(async ([personId, info]) => {
      const userId = accounts.get(personId);
      if (!userId) { out.noAccount++; return; }
      const body = `${when(e)} · ${e.room.name}. Posisi: ${info.positions.join(", ")}.${info.rehearsal && rehearsals ? ` Latihan: ${rehearsals}.` : ""}`;
      const r = await notifyUsers(u.tenantId, [userId], { kind: "PELAYAN_DIBERITAHU", dedupeKey: `${PREFIX(eventId)}${stamp}`, title: `Jadwal pelayanan: ${e.title}`, body, url: "/saya" });
      if (r.sent.length) out.sent++;
      else if (r.off.length) out.off++;
      else if (r.failed.length) out.failed++;
      else out.noDevice++;
    }));
  }
  return out;
}
