import { prisma } from "./prisma";
import { conflict, notFound } from "./errors";
import { notifyUsers, userIdsForPersons } from "./notify";
import { mailConfigured } from "./mailer";
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
  if (mailConfigured() && accounts.size) {
    // email terverifikasi juga bisa dijangkau (cadangan bila notifikasi HP belum aktif)
    const mails = await prisma.user.findMany({ where: { id: { in: [...accounts.values()] }, emailVerifiedAt: { not: null } }, select: { id: true } });
    for (const m of mails) withDevice.add(m.id);
  }
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

type SeatRef = { personId: string; ministryId: string };

/**
 * Kabari pelayan bila kursinya di acara yang SUDAH terbit berubah: yang dilepas diberi tahu tugasnya dialihkan,
 * yang baru diberi tahu dijadwalkan. Acara draf, dibatalkan, atau sudah selesai tidak mengirim apa pun.
 */
export async function notifySeatChange(tenantId: string, eventId: string, c: { removed?: SeatRef; added?: SeatRef }) {
  const e = await prisma.event.findFirst({ where: { id: eventId, tenantId, deletedAt: null, kind: "IBADAH" }, include: { room: { select: { name: true } } } });
  if (!e || e.status !== "PUBLISHED" || e.endsAt.getTime() < Date.now()) return;
  const refs = [c.removed, c.added].filter((x): x is SeatRef => !!x);
  const [accounts, ministries] = await Promise.all([
    userIdsForPersons(tenantId, refs.map((r) => r.personId)),
    prisma.ministry.findMany({ where: { id: { in: refs.map((r) => r.ministryId) } }, select: { id: true, name: true } }),
  ]);
  const name = new Map(ministries.map((m) => [m.id, m.name]));
  const stamp = Date.now();
  const place = `${when(e)} · ${e.room.name}`;
  if (c.removed && accounts.get(c.removed.personId)) {
    await notifyUsers(tenantId, [accounts.get(c.removed.personId)!], {
      kind: "PELAYAN_BATAL", dedupeKey: `ganti:${eventId}:keluar:${c.removed.personId}:${stamp}`,
      title: `Jadwal diganti: ${e.title}`, body: `${place}. Anda tidak lagi bertugas sebagai ${name.get(c.removed.ministryId) ?? "pelayan"}.`, url: "/saya",
    });
  }
  if (c.added && accounts.get(c.added.personId)) {
    await notifyUsers(tenantId, [accounts.get(c.added.personId)!], {
      kind: "PELAYAN_BATAL", dedupeKey: `ganti:${eventId}:masuk:${c.added.personId}:${stamp}`,
      title: `Jadwal baru: ${e.title}`, body: `Anda dijadwalkan sebagai ${name.get(c.added.ministryId) ?? "pelayan"} · ${place}.`, url: "/saya",
    });
  }
}

/** Kabari semua pelayan yang punya kursi di acara yang baru dibatalkan. Dipanggil hanya bila acaranya sudah terbit dan belum selesai. */
export async function notifyEventCancelled(tenantId: string, eventId: string) {
  const e = await loadEvent(tenantId, eventId);
  const people = peopleFor(e, "ALL");
  if (people.size === 0) return;
  const accounts = await userIdsForPersons(tenantId, [...people.keys()]);
  const stamp = Date.now();
  const entries = [...people.entries()];
  for (let i = 0; i < entries.length; i += 5) {
    await Promise.all(entries.slice(i, i + 5).map(async ([personId, info]) => {
      const userId = accounts.get(personId);
      if (!userId) return;
      await notifyUsers(tenantId, [userId], {
        kind: "PELAYAN_BATAL", dedupeKey: `batal:${eventId}:${stamp}`,
        title: `Acara dibatalkan: ${e.title}`, body: `${when(e)} · ${e.room.name} dibatalkan. Tugas Anda (${info.positions.join(", ")}) tidak jadi.`, url: "/saya",
      });
    }));
  }
}
