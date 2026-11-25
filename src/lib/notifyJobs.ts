import { prisma } from "./prisma";
import { notifyUsers, userIdsForPersons } from "./notify";
import { localParts, zonedToUtc } from "./time";
import { can, teamScope, type AuthUser } from "./rbac";
import { listViolations } from "./eventViolations";
import { dayShort, hm, MONTHS } from "./ui";
import { addDaysYmd, attendanceStage, diffDaysYmd, digestSummary, limitedList, logCutoff, monthBounds, shortHash } from "./notifyText";
import type { NotifKind } from "./notificationKinds";
import { birthdayMessage, birthdaysOn } from "./birthdays";

/**
 * Pekerjaan notifikasi terjadwal (dipanggil dari cron harian dan bulanan). Prinsip: satu pesan gabungan per orang per pekerjaan,
 * tidak ada pesan bila tidak ada isinya, dan kunci pesan (dedupeKey) membuat pekerjaan aman dijalankan ulang di hari yang sama.
 */

const dayRange = (ymd: string) => ({ gte: zonedToUtc(ymd, "00:00"), lt: zonedToUtc(addDaysYmd(ymd, 1), "00:00") });
const shortDay = (d: Date) => new Intl.DateTimeFormat("id-ID", { timeZone: process.env.APP_TIMEZONE ?? "Asia/Jakarta", day: "numeric", month: "short" }).format(d);

async function inBatches<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

type Lines = { at: Date; text: string };
const sorted = (lines: Lines[]) => lines.sort((a, b) => a.at.getTime() - b.at.getTime());

/** Kirim satu pesan gabungan per orang. `lines` per orang; orang tanpa akun atau tanpa baris dilewati. */
async function sendPerPerson(tenantId: string, kind: NotifKind, byPerson: Map<string, Lines[]>, make: (lines: Lines[]) => { title: string; body: string; url: string }, dedupeKey: string) {
  const accounts = await userIdsForPersons(tenantId, [...byPerson.keys()]);
  const out = { people: byPerson.size, sent: 0, skipped: 0 };
  await inBatches([...byPerson.entries()], 5, async ([personId, lines]) => {
    const userId = accounts.get(personId);
    if (!userId || lines.length === 0) { out.skipped++; return; }
    const r = await notifyUsers(tenantId, [userId], { kind, dedupeKey, ...make(sorted(lines)) });
    if (r.sent.length) out.sent++; else out.skipped++;
  });
  return out;
}

const push = (m: Map<string, Lines[]>, personId: string, line: Lines) => m.set(personId, [...(m.get(personId) ?? []), line]);

// ───────── Pengingat H-1 untuk pelayan: acara dan latihan besok ─────────
export async function remindTomorrowStaff(tenantId: string, now = new Date()) {
  const tomorrow = addDaysYmd(localParts(now).date, 1);
  const range = dayRange(tomorrow);
  const [events, rehearsals] = await Promise.all([
    prisma.event.findMany({
      where: { tenantId, deletedAt: null, kind: "IBADAH", status: "PUBLISHED", startsAt: range },
      select: { title: true, startsAt: true, assignments: { where: { personId: { not: null } }, select: { personId: true, ministry: { select: { name: true } } } } },
    }),
    prisma.rehearsalSession.findMany({
      where: { tenantId, deletedAt: null, startsAt: range, event: { deletedAt: null, kind: "IBADAH", status: "PUBLISHED" } },
      select: { startsAt: true, event: { select: { title: true, assignments: { where: { personId: { not: null }, rehearsalRequired: true }, select: { personId: true } } } } },
    }),
  ]);
  const by = new Map<string, Lines[]>();
  for (const e of events) {
    const mine = new Map<string, string[]>();
    for (const a of e.assignments) mine.set(a.personId!, [...(mine.get(a.personId!) ?? []), a.ministry.name]);
    for (const [pid, pos] of mine) push(by, pid, { at: e.startsAt, text: `${hm(e.startsAt)} ${e.title} (${[...new Set(pos)].join(", ")})` });
  }
  const seen = new Set<string>(); // latihan kembar (Ibadah Minggu 1 dan 2) di jam yang sama dihitung satu
  for (const r of rehearsals) {
    for (const a of r.event.assignments) {
      const k = `${a.personId}|${r.startsAt.getTime()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      push(by, a.personId!, { at: r.startsAt, text: `${hm(r.startsAt)} Latihan ${r.event.title}` });
    }
  }
  return sendPerPerson(tenantId, "PELAYAN_H1", by, (lines) => ({ title: "Besok Anda bertugas", body: `${dayShort(range.gte)}: ${limitedList(lines.map((l) => l.text), 4)}.`, url: "/saya" }), `h1:pelayan:${tomorrow}`);
}

// ───────── Pengingat H-1 rapat kelompok ─────────
export async function remindTomorrowMeetings(tenantId: string, now = new Date()) {
  const tomorrow = addDaysYmd(localParts(now).date, 1);
  const range = dayRange(tomorrow);
  const meetings = await prisma.event.findMany({
    where: { tenantId, deletedAt: null, kind: "RAPAT", status: "PUBLISHED", startsAt: range },
    select: { startsAt: true, group: { select: { name: true } }, room: { select: { name: true } }, participants: { where: { personId: { not: null }, status: { in: ["INVITED", "PRESENT"] } }, select: { personId: true } } },
  });
  const by = new Map<string, Lines[]>();
  for (const m of meetings) for (const p of m.participants) push(by, p.personId!, { at: m.startsAt, text: `${hm(m.startsAt)} ${m.group ? `Rapat ${m.group.name}` : "Rapat"} · ${m.room.name}` });
  return sendPerPerson(tenantId, "KELOMPOK_H1", by, (lines) => ({ title: "Besok ada rapat", body: `${dayShort(range.gte)}: ${limitedList(lines.map((l) => l.text), 3)}.`, url: "/rapat" }), `h1:kelompok:${tomorrow}`);
}

// ───────── Penjadwal ─────────
/** Akun yang berperan sebagai penjadwal tanpa batas tim (Superadmin dan Penjadwal). Admin Tim tidak ikut karena cakupannya terbatas. */
async function schedulerUserIds(tenantId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { tenantId, isActive: true, deletedAt: null, roles: { some: {} } },
    select: { id: true, personId: true, roles: { select: { teamTypeId: true, role: { select: { code: true, isSuperadmin: true, permissions: { select: { permission: { select: { code: true } } } } } } } } },
  });
  return users.filter((u) => {
    const au: AuthUser = {
      userId: u.id, tenantId, personId: u.personId,
      roles: u.roles.map((r) => ({ code: r.role.code, isSuperadmin: r.role.isSuperadmin, teamTypeId: r.teamTypeId })),
      permissions: [...new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)))],
    };
    return can(au, "event.write") && teamScope(au) === null;
  }).map((u) => u.id);
}

/** Penanda "sudah diberi tahu" per akun dan kunci, disimpan di log notifikasi supaya satu hal tidak diumumkan berulang. */
async function markedKeys(userId: string, keys: string[]): Promise<Set<string>> {
  if (!keys.length) return new Set();
  const rows = await prisma.notificationLog.findMany({ where: { userId, dedupeKey: { in: keys } }, select: { dedupeKey: true } });
  return new Set(rows.map((r) => r.dedupeKey));
}
const writeMarkers = (tenantId: string, userId: string, kind: NotifKind, keys: string[], label: string) =>
  keys.length ? prisma.notificationLog.createMany({ data: keys.map((dedupeKey) => ({ tenantId, userId, kind, dedupeKey, title: "Penanda pengingat", body: label.slice(0, 200), devices: 0 })), skipDuplicates: true }) : Promise.resolve();

/** Kehadiran belum diisi: sekali setelah acara selesai, dan sekali lagi bila sudah 3 hari atau lebih. Acara 7 hari terakhir saja. */
export async function remindAttendance(tenantId: string, now = new Date()) {
  const today = localParts(now).date;
  const events = await prisma.event.findMany({
    where: { tenantId, deletedAt: null, kind: "IBADAH", status: "PUBLISHED", endsAt: { lt: now }, startsAt: { gte: zonedToUtc(addDaysYmd(today, -7), "00:00") } },
    select: { id: true, title: true, startsAt: true, attendanceSummary: { select: { id: true } }, attendances: { select: { id: true }, take: 1 } },
    orderBy: { startsAt: "asc" },
  });
  const unfilled = events.filter((e) => !e.attendanceSummary && e.attendances.length === 0);
  const out = { events: unfilled.length, recipients: 0, sent: 0 };
  if (!unfilled.length) return out;
  const users = await schedulerUserIds(tenantId);
  out.recipients = users.length;
  await inBatches(users, 5, async (userId) => {
    const marked = await markedKeys(userId, unfilled.flatMap((e) => [`hadir:${e.id}:1`, `hadir:${e.id}:2`]));
    const need: { e: (typeof unfilled)[number]; stage: 1 | 2 }[] = [];
    for (const e of unfilled) {
      const stage = attendanceStage(diffDaysYmd(today, localParts(e.startsAt).date), { first: marked.has(`hadir:${e.id}:1`), second: marked.has(`hadir:${e.id}:2`) });
      if (stage) need.push({ e, stage });
    }
    if (!need.length) return;
    const again = need.some((n) => n.stage === 2);
    const r = await notifyUsers(tenantId, [userId], {
      kind: "PENJADWAL_KEHADIRAN", dedupeKey: `hadir:run:${today}`,
      title: again ? "Kehadiran masih belum diisi" : "Kehadiran belum diisi",
      body: `${limitedList(need.map((n) => `${n.e.title} (${shortDay(n.e.startsAt)})`), 3)}.`, url: "/jadwal",
    });
    if (!r.sent.length) return;
    out.sent++;
    await writeMarkers(tenantId, userId, "PENJADWAL_KEHADIRAN", need.flatMap((n) => (n.stage === 2 ? [`hadir:${n.e.id}:1`, `hadir:${n.e.id}:2`] : [`hadir:${n.e.id}:1`])), need.map((n) => n.e.title).join("; "));
  });
  return out;
}

/** Pelanggaran aturan yang BARU muncul sejak pemeriksaan sebelumnya, satu ringkasan per penjadwal. */
export async function remindNewViolations(tenantId: string, now = new Date()) {
  const today = localParts(now).date;
  const admin: AuthUser = { userId: "cron", tenantId, personId: null, roles: [{ code: "SUPERADMIN", isSuperadmin: true, teamTypeId: null }], permissions: [] };
  const found: { key: string; text: string }[] = [];
  for (let page = 1; page <= 5; page++) {
    const r = await listViolations(admin, { page, pageSize: 100 });
    for (const ev of r.items) for (const v of ev.violations) found.push({ key: `aturan:${ev.id}:${v.code}:${shortHash(v.message)}`, text: `${ev.title} (${shortDay(new Date(ev.startsAt))}): ${v.label}` });
    if (page >= r.pages) break;
  }
  const out = { violations: found.length, recipients: 0, sent: 0 };
  if (!found.length) return out;
  const users = await schedulerUserIds(tenantId);
  out.recipients = users.length;
  await inBatches(users, 5, async (userId) => {
    const marked = await markedKeys(userId, found.map((f) => f.key));
    const fresh = found.filter((f) => !marked.has(f.key));
    if (!fresh.length) return;
    const r = await notifyUsers(tenantId, [userId], {
      kind: "PENJADWAL_ATURAN", dedupeKey: `aturan:run:${today}`,
      title: fresh.length === 1 ? "Ada 1 pelanggaran aturan baru" : `Ada ${fresh.length} pelanggaran aturan baru`,
      body: `${limitedList(fresh.map((f) => f.text), 2)}.`, url: "/jadwal/pemeriksaan",
    });
    if (!r.sent.length) return;
    out.sent++;
    await writeMarkers(tenantId, userId, "PENJADWAL_ATURAN", fresh.map((f) => f.key), fresh.map((f) => f.text).join("; "));
  });
  return out;
}

// ───────── Ringkasan awal bulan ─────────
/** Tiap akun menerima ringkasan acara, posisi, latihan, dan rapat miliknya di bulan berjalan. Tidak ada isi = tidak ada pesan. */
export async function monthlyDigest(tenantId: string, now = new Date()) {
  const mb = monthBounds(localParts(now).date);
  const range = { gte: zonedToUtc(mb.from, "00:00"), lt: zonedToUtc(mb.next, "00:00") };
  const [seats, meetings] = await Promise.all([
    prisma.eventAssignment.findMany({
      where: { tenantId, personId: { not: null }, event: { deletedAt: null, kind: "IBADAH", status: "PUBLISHED", startsAt: range } },
      select: { personId: true, rehearsalRequired: true, ministry: { select: { name: true } }, event: { select: { id: true, title: true, startsAt: true, rehearsals: { where: { deletedAt: null }, select: { startsAt: true } } } } },
    }),
    prisma.meetingParticipant.findMany({
      where: { personId: { not: null }, status: { in: ["INVITED", "PRESENT"] }, event: { tenantId, deletedAt: null, kind: "RAPAT", status: "PUBLISHED", startsAt: range } },
      select: { personId: true, event: { select: { startsAt: true, group: { select: { name: true } } } } },
    }),
  ]);

  type Item = Lines & { type: "acara" | "latihan" | "rapat" };
  const by = new Map<string, Item[]>();
  const add = (pid: string, it: Item) => by.set(pid, [...(by.get(pid) ?? []), it]);
  const perEvent = new Map<string, { personId: string; title: string; startsAt: Date; positions: string[] }>();
  const rehSeen = new Set<string>();
  for (const s of seats) {
    const k = `${s.personId}|${s.event.id}`;
    const cur = perEvent.get(k) ?? { personId: s.personId!, title: s.event.title, startsAt: s.event.startsAt, positions: [] };
    if (!cur.positions.includes(s.ministry.name)) cur.positions.push(s.ministry.name);
    perEvent.set(k, cur);
    if (s.rehearsalRequired) {
      for (const r of s.event.rehearsals) {
        const rk = `${s.personId}|${r.startsAt.getTime()}`;
        if (rehSeen.has(rk)) continue; // latihan kembar dihitung satu
        rehSeen.add(rk);
        add(s.personId!, { type: "latihan", at: r.startsAt, text: `${shortDay(r.startsAt)} latihan ${s.event.title}` });
      }
    }
  }
  for (const e of perEvent.values()) add(e.personId, { type: "acara", at: e.startsAt, text: `${shortDay(e.startsAt)} ${e.title} (${e.positions.join(", ")})` });
  for (const m of meetings) add(m.personId!, { type: "rapat", at: m.event.startsAt, text: `${shortDay(m.event.startsAt)} rapat ${m.event.group?.name ?? "kelompok"}` });

  const accounts = await userIdsForPersons(tenantId, [...by.keys()]);
  const out = { people: by.size, sent: 0, skipped: 0 };
  await inBatches([...by.entries()], 5, async ([personId, items]) => {
    const userId = accounts.get(personId);
    if (!userId || items.length === 0) { out.skipped++; return; }
    const list = items.sort((a, b) => a.at.getTime() - b.at.getTime());
    const count = (t: Item["type"]) => list.filter((i) => i.type === t).length;
    const r = await notifyUsers(tenantId, [userId], {
      kind: "PELAYAN_BULANAN", dedupeKey: `bulanan:${mb.month}`,
      title: `Jadwal Anda bulan ${MONTHS[mb.monthIndex]} ${mb.year}`,
      body: `${digestSummary({ acara: count("acara"), latihan: count("latihan"), rapat: count("rapat") })} ${limitedList(list.map((i) => i.text), 4)}.`, url: "/saya",
    });
    if (r.sent.length) out.sent++; else out.skipped++;
  });
  return out;
}

/**
 * Bersihkan catatan notifikasi lama supaya penyimpanan database tidak naik tanpa batas (satu baris per penerima per pesan).
 * Hanya jenis yang kuncinya terikat tanggal (satu pesan per hari atau bulan): setelah lewat, kunci itu tidak pernah dicek lagi.
 * Dibiarkan: pemberitahuan dan pembatalan yang terikat acara, serta "Penanda pengingat" (mencegah pengumuman ulang untuk hal yang masih berlaku).
 */
const DATE_BOUND_KINDS: NotifKind[] = ["ULANG_TAHUN", "PELAYAN_H1", "KELOMPOK_H1", "PELAYAN_BULANAN", "PENJADWAL_KEHADIRAN", "PENJADWAL_ATURAN"];
export async function pruneNotificationLog(tenantId: string, now = new Date()) {
  const r = await prisma.notificationLog.deleteMany({
    where: { tenantId, kind: { in: DATE_BOUND_KINDS }, createdAt: { lt: logCutoff(now) }, NOT: { title: "Penanda pengingat" } },
  });
  return { dihapus: r.count };
}

/** Jalankan satu pekerjaan dengan aman: kegagalan satu pekerjaan tidak menghentikan yang lain. */
export async function safely<T>(name: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try { return await fn(); } catch (e) { console.error(`[cron] ${name}`, e); return { error: e instanceof Error ? e.message : "gagal" }; }
}

// ───────── Ulang tahun jemaat: pagi hari, ke semua akun aktif ─────────
/**
 * Satu pesan gabungan per akun berisi semua yang berulang tahun hari ini. Ulang tahun pemilik akun itu sendiri tidak diikutkan
 * di pesannya; bila hanya dia yang berulang tahun, ia tidak menerima apa pun. Pemilik yang mematikan jenis ULANG_TAHUN dilewati oleh notifyUsers.
 */
export async function remindBirthdays(tenantId: string, now = new Date()) {
  const today = localParts(now).date;
  const people = await prisma.person.findMany({
    where: { tenantId, deletedAt: null, birthDate: { not: null } },
    select: { id: true, name: true, nickname: true, birthDate: true },
  });
  const todays = birthdaysOn(people.map((p) => ({ ...p, birthDate: p.birthDate! })), today);
  const out = { birthdays: todays.length, recipients: 0, sent: 0, skipped: 0 };
  if (!todays.length) return out;

  const users = await prisma.user.findMany({ where: { tenantId, isActive: true, deletedAt: null }, select: { id: true, personId: true } });
  // akun dikelompokkan menurut daftar nama yang diterimanya (hampir semua akun menerima daftar yang sama)
  const groups = new Map<string, { names: string[]; userIds: string[] }>();
  for (const u of users) {
    const names = todays.filter((b) => b.personId !== u.personId).map((b) => b.name);
    if (!names.length) { out.skipped++; continue; }
    const key = names.join("|");
    const g = groups.get(key) ?? { names, userIds: [] };
    g.userIds.push(u.id);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    out.recipients += g.userIds.length;
    const r = await notifyUsers(tenantId, g.userIds, { kind: "ULANG_TAHUN", dedupeKey: `ultah:${today}`, ...birthdayMessage(g.names), url: "/" });
    out.sent += r.sent.length;
    out.skipped += g.userIds.length - r.sent.length;
  }
  return out;
}
