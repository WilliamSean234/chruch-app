import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { ApiError, badRequest, conflict, forbidden, notFound } from "./errors";
import { can, type AuthUser } from "./rbac";
import { addMinutes, DATE_RE, localParts, TIME_RE, zonedToUtc } from "./time";
import { assertRoomFree, assertRoomUsable, bookRoom, personConflicts, releaseBookings, translateOverlap } from "./booking";
import { nextDocNumber } from "./docNumber";
import { creatorNames } from "./creators";
import { canSeeMeetingSchedule, groupCaps, type GroupCaps } from "./groups";
import { meetingMemberTitle, meetingPublicTitle } from "./meetingLabel";
import { pageOf, pagingQuery, resolvePaging } from "./paging";
import { eventYears } from "./years";
import { randomUUID } from "node:crypto";
import { openGuest, openMeetingRow, openNote, openOnlineUrl, openSpeaker, openTheme, openTitleSafe, sealGuest, sealLink, sealNote, sealReason, sealTheme, sealTitle } from "./meetingCrypto";
import { ensureOnlineRoom, NOT_ONLINE, onlineFields, prepareOnline } from "./online";
import { describeFirst, expandDates, MAX_OCCURRENCES, PATTERNS, patternText, type Pattern } from "./recurrence";

/**
 * Rapat kelompok. Disimpan sebagai Event dengan kind = RAPAT supaya ruangan memakai satu buku pemesanan yang sama
 * dengan ibadah (tidak mungkin bentrok). Rapat langsung berlaku tanpa persetujuan.
 *
 * Aturan lihat:
 * - Semua orang yang masuk melihat WAKTU, RUANGAN, dan NAMA KELOMPOK. Topik dan peserta hanya bila pembuat mengizinkan.
 * - Notulen, tautan lampiran, dan rincian lain hanya untuk anggota kelompok. Superadmin dan Penjadwal global
 *   yang bukan anggota tidak ikut membaca; mereka hanya mengatur judul, waktu, ruangan, dan kelompok.
 */

const url = z.string().trim().max(500).refine((v) => /^https?:\/\/\S+$/i.test(v), "Tautan harus diawali http:// atau https://");
export const linkBody = z.object({ title: z.string().trim().min(1, "Judul tautan wajib diisi").max(120), url });

const guestName = z.string().trim().min(1, "Nama tamu wajib diisi").max(80);
/** Undangan saat membuat rapat: seluruh anggota (bawaan), atau anggota tertentu; tamu opsional. Memilih nama dan tamu hanya untuk anggota kelompok. */
export const inviteBody = z.object({
  mode: z.enum(["ALL", "SELECT"]).default("ALL"),
  personIds: z.array(z.string().uuid()).max(300).default([]),
  guests: z.array(guestName).max(30).default([]),
});
export const addParticipantsBody = z.object({
  personIds: z.array(z.string().uuid()).max(300).default([]),
  guests: z.array(guestName).max(30).default([]),
  allMembers: z.boolean().default(false),
});
export const ATTENDANCE = ["INVITED", "PRESENT", "EXCUSED", "ABSENT"] as const;
export const attendanceBody = z.object({ status: z.enum(ATTENDANCE), note: z.string().trim().max(200).nullable().optional() });
export const bulkAttendanceBody = z.object({ status: z.enum(["PRESENT", "EXCUSED", "ABSENT"]) });
/** Semua perubahan kehadiran, peserta, dan tautan pada halaman rapat, disimpan sekaligus lewat tombol "Simpan perubahan". */
export const changesBody = z.object({
  attendance: z.array(z.object({ id: z.string().uuid(), status: z.enum(ATTENDANCE) })).max(500).default([]),
  remove: z.array(z.string().uuid()).max(500).default([]),
  addMembers: z.array(z.object({ personId: z.string().uuid(), status: z.enum(ATTENDANCE).default("INVITED") })).max(300).default([]),
  addGuests: z.array(z.object({ name: guestName, status: z.enum(ATTENDANCE).default("INVITED") })).max(30).default([]),
  addAllMembers: z.boolean().default(false),
  linkAdd: z.array(linkBody).max(20).default([]),
  linkRemove: z.array(z.string().uuid()).max(50).default([]),
});

/** Pengulangan: berhenti setelah sekian kali, atau pada tanggal tertentu. Paling banyak 26 rapat sekali buat. */
export const repeatBody = z.object({
  pattern: z.enum(PATTERNS),
  count: z.number().int().min(2).max(MAX_OCCURRENCES).optional(),
  until: z.string().regex(DATE_RE).optional(),
}).refine((v) => !!v.count || !!v.until, { message: "Pilih berhenti setelah sekian kali atau pada tanggal tertentu." });

export const meetingCreateBody = z.object({
  groupId: z.string().uuid(),
  title: z.string().trim().min(1, "Judul atau topik rapat wajib diisi").max(120),
  date: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE),
  endTime: z.string().regex(TIME_RE),
  roomId: z.string().uuid().optional(), // wajib kecuali rapat online
  ...onlineFields,
  theme: z.string().trim().max(600).nullish(), // tema rapat online (terenkripsi)
  showTopic: z.boolean().default(false),
  showAttendees: z.boolean().default(false),
  links: z.array(linkBody).max(20).default([]),
  invite: inviteBody.default({ mode: "ALL", personIds: [], guests: [] }),
  repeat: repeatBody.optional(),
});

export const meetingUpdateBody = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  date: z.string().regex(DATE_RE).optional(),
  startTime: z.string().regex(TIME_RE).optional(),
  endTime: z.string().regex(TIME_RE).optional(),
  roomId: z.string().uuid().optional(),
  ...onlineFields,
  theme: z.string().trim().max(600).nullish(),
  showTopic: z.boolean().optional(),
  showAttendees: z.boolean().optional(),
});

export const cancelBody = z.object({
  reason: z.string().trim().min(1, "Isi alasan pembatalan").max(300),
  /** Rapat berulang: ONE = rapat ini saja, FOLLOWING = rapat ini dan semua yang berikutnya dalam seri. */
  scope: z.enum(["ONE", "FOLLOWING"]).default("ONE"),
});

/**
 * Penjadwal global (role Penjadwal atau Superadmin) boleh MELIHAT jadwal rapat semua kelompok (waktu, ruangan, judul),
 * tetapi tidak boleh menjadwalkan atau mengubahnya: rapat hanya dikelola anggota kelompok yang jabatannya berhak.
 * Superadmin tidak punya pengecualian di sini.
 */
const isGlobalScheduler = (u: AuthUser) => can(u, "event.write");

export type Access = { caps: GroupCaps; global: boolean; canManage: boolean };
export async function accessTo(u: AuthUser, groupId: string): Promise<Access> {
  const caps = await groupCaps(u, groupId);
  const global = isGlobalScheduler(u);
  return { caps, global, canManage: caps.canSchedule };
}

const withGroup = { group: { select: { id: true, name: true, quorumMin: true } }, room: true, links: { where: { deletedAt: null }, orderBy: { createdAt: "asc" as const } } } satisfies Prisma.EventInclude;
type MeetingRow = Prisma.EventGetPayload<{ include: typeof withGroup }>;

export async function loadMeeting(u: AuthUser, id: string) {
  const e = await prisma.event.findFirst({ where: { id, tenantId: u.tenantId, deletedAt: null, kind: "RAPAT" }, include: withGroup });
  if (!e || !e.group) throw notFound("Rapat");
  return openMeetingRow(e) as MeetingRow & { group: { id: string; name: string; quorumMin: number | null } };
}

export type ParticipantDto = {
  id: string; personId: string | null; name: string; isGuest: boolean; status: string; note: string | null; positions: string[];
};
type ParticipantRow = { id: string; personId: string | null; guestName: string | null; status: string; note: string | null; person: { name: string; title: string | null } | null };

/** Ringkasan kehadiran. Tamu tidak dihitung untuk kuorum; kuorum = persen anggota undangan yang hadir. */
export function summarizeAttendance(rows: { personId: string | null; status: string }[], quorumMin: number | null) {
  const members = rows.filter((r) => r.personId);
  const count = (st: string) => members.filter((r) => r.status === st).length;
  const present = count("PRESENT");
  return {
    invited: members.length,
    present, excused: count("EXCUSED"), absent: count("ABSENT"), pending: count("INVITED"),
    guests: rows.length - members.length,
    guestsPresent: rows.filter((r) => !r.personId && r.status === "PRESENT").length,
    percent: members.length ? Math.round((present * 100) / members.length) : 0,
    quorumMin,
    quorumMet: quorumMin == null ? null : members.length > 0 && present * 100 >= quorumMin * members.length,
  };
}

/** Peserta rapat. Anggota kelompok melihat lengkap; orang lain hanya nama anggota yang diundang, dan hanya bila "tampilkan peserta" menyala. */
async function participantsView(groupId: string, eventId: string, quorumMin: number | null, member: boolean, showAttendees: boolean) {
  const empty = { participants: [] as ParticipantDto[], attendance: null as ReturnType<typeof summarizeAttendance> | null, attendeesPublic: null as string[] | null };
  if (!member && !showAttendees) return empty;
  const rows: ParticipantRow[] = await prisma.meetingParticipant.findMany({
    where: { eventId }, select: { id: true, personId: true, guestName: true, status: true, note: true, person: { select: { name: true, title: true } } },
  });
  const nameOf = (r: ParticipantRow) => (r.person ? `${r.person.title ? `${r.person.title} ` : ""}${r.person.name}` : openGuest(eventId, r.guestName) ?? "").trim();
  if (!member) {
    return { ...empty, attendeesPublic: rows.filter((r) => r.personId).map(nameOf).sort((x, y) => x.localeCompare(y)) };
  }
  const gm = await prisma.groupMember.findMany({
    where: { groupId, leftAt: null, personId: { in: rows.map((r) => r.personId).filter((x): x is string => !!x) } },
    select: { personId: true, positions: { select: { position: { select: { name: true, deletedAt: true, sortOrder: true } } } } },
  });
  const posOf = new Map(gm.map((m) => [m.personId, m.positions.map((x) => x.position).filter((p) => !p.deletedAt).sort((x, y) => x.sortOrder - y.sortOrder).map((p) => p.name)]));
  const participants: ParticipantDto[] = rows
    .map((r) => ({ id: r.id, personId: r.personId, name: nameOf(r), isGuest: !r.personId, status: r.status, note: openNote(eventId, r.note), positions: r.personId ? posOf.get(r.personId) ?? [] : [] }))
    .sort((x, y) => Number(x.isGuest) - Number(y.isGuest) || x.name.localeCompare(y.name));
  return { participants, attendance: summarizeAttendance(rows, quorumMin), attendeesPublic: null };
}

/** Bentuk data sesuai siapa yang melihat. Bukan anggota = tanpa tautan dan tanpa judul (kecuali diizinkan). */
async function toDto(u: AuthUser, e: MeetingRow & { group: { id: string; name: string; quorumMin: number | null } }) {
  const a = await accessTo(u, e.group.id);
  const member = a.caps.isMember;
  const seesTitle = member || a.global || e.showTopic; // penjadwal global ikut tahu judulnya karena ia yang mengisinya
  const names = await creatorNames([e.createdById]);
  const minutes = member ? await prisma.meetingMinutes.findUnique({ where: { eventId: e.id }, select: { status: true, version: true } }) : null;
  const people = await participantsView(e.group.id, e.id, e.group.quorumMin, member, e.showAttendees);
  let series: { text: string; index: number; total: number; later: number } | null = null;
  if (e.seriesId) {
    const sr = await prisma.meetingSeries.findUnique({ where: { id: e.seriesId } });
    if (sr) {
      const later = await prisma.event.count({ where: { seriesId: e.seriesId, deletedAt: null, status: { not: "CANCELLED" }, startsAt: { gt: e.startsAt } } });
      series = { text: patternText(sr.pattern as Pattern, sr.weekday, sr.ordinal), index: e.seriesIndex ?? 1, total: sr.total, later };
    }
  }
  return {
    id: e.id,
    number: e.number,
    status: e.status,
    cancelReason: member || a.global ? e.cancelReason : null,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    room: { id: e.room.id, name: e.room.name },
    group: { id: e.group.id, name: e.group.name, quorumMin: member ? e.group.quorumMin : null },
    title: seesTitle ? e.title : null,
    displayTitle: member ? meetingMemberTitle(e.group.name, e.title) : meetingPublicTitle(e.group.name, e.title, e.showTopic),
    showTopic: e.showTopic,
    showAttendees: e.showAttendees,
    createdBy: member || a.global ? ((e.createdById && names.get(e.createdById)) || null) : null,
    // isi rapat: hanya anggota kelompok
    locked: !member,
    links: member ? e.links.map((l) => ({ id: l.id, title: l.title, url: l.url })) : [],
    // rapat online: tautan, tema, dan pembicara adalah isi rapat, hanya untuk anggota kelompok. Yang lain hanya tahu rapat ini online (ruangannya "Online").
    isOnline: e.isOnline,
    online: e.isOnline && member ? await onlineMeetingView(e) : null,
    minutes: minutes ? { status: minutes.status, version: minutes.version } : null,
    series,
    participants: people.participants,
    attendance: people.attendance,
    attendeesPublic: people.attendeesPublic,
    viewer: {
      isMember: member,
      canManage: a.canManage && e.status !== "CANCELLED",
      canAttach: member && (a.caps.canSchedule || a.caps.canWriteMinutes) && e.status !== "CANCELLED",
      canWriteMinutes: member && (a.caps.canWriteMinutes || a.caps.canFinalize) && e.status !== "CANCELLED",
      canRecord: member && (a.caps.canSchedule || a.caps.canWriteMinutes) && e.status !== "CANCELLED", // undang, hapus, catat kehadiran
    },
  };
}

/** Tautan, tema, dan pembicara rapat online; hanya dipanggil untuk anggota kelompok. */
async function onlineMeetingView(e: MeetingRow) {
  const open = (f: () => string | null): string | null => { try { return f(); } catch { return null; } };
  const person = e.speakerPersonId ? await prisma.person.findFirst({ where: { id: e.speakerPersonId, tenantId: e.tenantId }, select: { id: true, name: true } }) : null;
  const typed = e.speakerName ? open(() => openSpeaker(e.id, e.speakerName)) : null;
  return {
    isOnline: true as const, canSeeLink: true,
    url: open(() => openOnlineUrl(e.id, e.onlineUrl)),
    theme: e.theme ? open(() => openTheme(e.id, e.theme)) : null,
    speaker: person ? { personId: person.id, name: person.name } : typed ? { personId: null, name: typed } : null,
  };
}

export async function getMeeting(u: AuthUser, id: string) {
  return toDto(u, await loadMeeting(u, id));
}

type ListRow = MeetingRow & { group: { id: string; name: string; quorumMin: number | null } };

/** Satu baris daftar rapat, disamarkan sesuai siapa yang melihat. */
function listItem(e: ListRow, member: boolean, global: boolean) {
  return {
    id: e.id, number: e.number, status: e.status,
    startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(),
    room: { id: e.room.id, name: e.room.name, floor: e.room.floor },
    group: { id: e.group.id, name: e.group.name },
    displayTitle: member ? meetingMemberTitle(e.group.name, e.title) : meetingPublicTitle(e.group.name, e.title, e.showTopic),
    title: member || global || e.showTopic ? e.title : null,
    isMember: member,
    canManage: member, // penyempurnaan hak jabatan dicek saat mengubah
  };
}

/** Daftar rapat pada rentang tanggal (untuk kalender). Semua orang melihat bentuk yang disamarkan; anggota melihat lengkap. */
export async function listMeetings(u: AuthUser, q: { from: string; to: string; groupId?: string; includeCancelled?: boolean }) {
  if (!(await canSeeMeetingSchedule(u))) return []; // bukan anggota kelompok dan bukan penjadwal: tidak melihat rapat sama sekali
  const rows = await prisma.event.findMany({
    where: {
      tenantId: u.tenantId, deletedAt: null, kind: "RAPAT",
      ...(q.includeCancelled ? {} : { status: { not: "CANCELLED" } }),
      ...(q.groupId ? { groupId: q.groupId } : {}),
      startsAt: { gte: zonedToUtc(q.from, "00:00"), lte: zonedToUtc(q.to, "23:59") },
    },
    include: withGroup,
    orderBy: { startsAt: "asc" },
    take: 500,
  });
  const groupIds = [...new Set(rows.map((r) => r.groupId).filter((x): x is string => !!x))];
  const mine = u.personId
    ? new Set((await prisma.groupMember.findMany({ where: { personId: u.personId, leftAt: null, groupId: { in: groupIds } }, select: { groupId: true } })).map((m) => m.groupId))
    : new Set<string>();
  const global = isGlobalScheduler(u);
  return rows.filter((e): e is ListRow => !!e.group).map((e) => listItem(openMeetingRow(e, true), mine.has(e.group.id), global));
}

export const meetingListQuery = z.object({
  when: z.enum(["next", "past", "all"]).default("next"),
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
  groupId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  status: z.enum(["PUBLISHED", "CANCELLED"]).optional(),
  mine: z.enum(["true", "false"]).optional(), // hanya kelompok yang saya ikuti
  search: z.string().trim().max(80).optional(),
  ...pagingQuery,
});

/**
 * Daftar rapat berhalaman untuk halaman Rapat. Pencarian judul hanya mencocokkan rapat yang judulnya boleh dilihat
 * pengguna (anggota kelompok, Penjadwal global, atau topik yang diizinkan tampil), supaya topik tertutup tidak bocor lewat pencarian.
 */
export async function listMeetingsPaged(u: AuthUser, q: z.infer<typeof meetingListQuery>) {
  const pg = resolvePaging(q);
  const global = isGlobalScheduler(u);
  const myIds = u.personId
    ? (await prisma.groupMember.findMany({ where: { personId: u.personId, leftAt: null, group: { deletedAt: null } }, select: { groupId: true } })).map((m) => m.groupId)
    : [];
  const now = new Date();
  const and: Prisma.EventWhereInput[] = [];
  if (q.mine === "true") and.push({ groupId: { in: myIds } });
  // Judul rapat tersimpan terenkripsi, jadi tidak bisa dicari di database: pencarian dilakukan sesudah judul dibuka (lihat di bawah).
  const where: Prisma.EventWhereInput = {
    tenantId: u.tenantId, deletedAt: null, kind: "RAPAT", group: { is: { deletedAt: null } },
    ...(q.when === "next" ? { endsAt: { gte: now } } : q.when === "past" ? { endsAt: { lt: now } } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.groupId ? { groupId: q.groupId } : {}),
    ...(q.roomId ? { roomId: q.roomId } : {}),
    ...(q.from || q.to ? { startsAt: { ...(q.from ? { gte: zonedToUtc(q.from, "00:00") } : {}), ...(q.to ? { lte: zonedToUtc(q.to, "23:59") } : {}) } } : {}),
    ...(and.length ? { AND: and } : {}),
  };
  const order = { startsAt: q.when === "next" ? ("asc" as const) : ("desc" as const) };
  // Tanpa pencarian: halaman diambil langsung dari database. Dengan pencarian: judul dibuka dulu di memori (jumlah rapat gereja kecil), baru dipotong per halaman.
  const pageRows = async (): Promise<{ total: number; rows: ListRow[] }> => {
    if (!q.search) {
      const [total, rows] = await Promise.all([prisma.event.count({ where }), prisma.event.findMany({ where, include: withGroup, orderBy: order, skip: pg.skip, take: pg.take })]);
      return { total, rows: rows.filter((e): e is ListRow => !!e.group) };
    }
    const needle = q.search.toLowerCase();
    const has = (v: string | null | undefined) => !!v && v.toLowerCase().includes(needle);
    const cand = await prisma.event.findMany({
      where, orderBy: order,
      select: { id: true, number: true, title: true, showTopic: true, groupId: true, group: { select: { name: true } }, room: { select: { name: true } } },
    });
    const hit = cand.filter((e) => {
      if (has(e.group?.name) || has(e.number) || has(e.room?.name)) return true;
      const titleVisible = global || e.showTopic || (!!e.groupId && myIds.includes(e.groupId));
      return titleVisible && has(openTitleSafe(e.id, e.title));
    });
    const ids = hit.slice(pg.skip, pg.skip + pg.take).map((e) => e.id);
    const found = ids.length ? await prisma.event.findMany({ where: { id: { in: ids } }, include: withGroup }) : [];
    const byId = new Map(found.map((e) => [e.id, e]));
    return { total: hit.length, rows: ids.map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => !!e && !!e.group) as ListRow[] };
  };
  const [{ total, rows }, groups, rooms, years] = await Promise.all([
    pageRows(),
    prisma.meetingGroup.findMany({ where: { tenantId: u.tenantId, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.room.findMany({ where: { tenantId: u.tenantId, deletedAt: null, isOnline: false }, orderBy: [{ floor: { sort: "asc", nulls: "last" } }, { name: "asc" }], select: { id: true, name: true, floor: true } }),
    eventYears(u.tenantId, "RAPAT"),
  ]);
  const mine = new Set(myIds);
  const items = rows.map((e) => listItem(openMeetingRow(e, true), mine.has(e.group.id), global));
  return { ...pageOf(items, total, pg), options: { groups, rooms, years } };
}

/** Kelompok yang boleh dipilih saat membuat rapat: hanya kelompok yang jabatan Anda berhak menjadwalkan (Superadmin pun begitu). */
export async function schedulableGroups(u: AuthUser) {
  const rows = await prisma.meetingGroup.findMany({
    where: {
      tenantId: u.tenantId, deletedAt: null,
      members: { some: { personId: u.personId ?? "none", leftAt: null, positions: { some: { position: { canSchedule: true, deletedAt: null } } } } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, _count: { select: { members: { where: { leftAt: null } } } } },
  });
  const memberOf = u.personId ? new Set((await prisma.groupMember.findMany({ where: { personId: u.personId, leftAt: null, groupId: { in: rows.map((r) => r.id) } }, select: { groupId: true } })).map((m) => m.groupId)) : new Set<string>();
  return rows.map((g) => ({ id: g.id, name: g.name, memberCount: g._count.members, isMember: memberOf.has(g.id) }));
}

// ───────── Buat / ubah / batal ─────────
function range(date: string, startTime: string, endTime: string) {
  const startsAt = zonedToUtc(date, startTime);
  const endsAt = zonedToUtc(date, endTime);
  if (endsAt <= startsAt) throw badRequest("Jam selesai harus setelah jam mulai.");
  if (endsAt.getTime() - startsAt.getTime() > 12 * 3600_000) throw badRequest("Rapat paling lama 12 jam.");
  return { startsAt, endsAt };
}

async function activeMemberIds(groupId: string) {
  const rows = await prisma.groupMember.findMany({ where: { groupId, leftAt: null, person: { deletedAt: null } }, select: { personId: true } });
  return new Set(rows.map((r) => r.personId));
}
const uniqueGuests = (names: string[]) => [...new Map(names.map((g) => [g.toLowerCase(), g])).values()];

export async function createMeeting(u: AuthUser, b: z.infer<typeof meetingCreateBody>, opts: { seriesId?: string; seriesIndex?: number } = {}) {
  const group = await prisma.meetingGroup.findFirst({ where: { id: b.groupId, tenantId: u.tenantId, deletedAt: null }, select: { id: true, name: true } });
  if (!group) throw notFound("Kelompok");
  const a = await accessTo(u, group.id);
  if (!a.canManage) throw forbidden("Anda tidak punya hak menjadwalkan rapat untuk kelompok ini.");
  // tautan = isi rapat, jadi hanya anggota kelompok yang boleh menambahkannya
  if (b.links.length && !a.caps.isMember) throw forbidden("Tautan lampiran hanya bisa ditambahkan oleh anggota kelompok.");
  // nama peserta dan tamu = isi rapat, jadi hanya anggota kelompok yang boleh memilih sendiri; Penjadwal non-anggota hanya bisa mengundang seluruh anggota
  if ((b.invite.mode === "SELECT" || b.invite.guests.length) && !a.caps.isMember) throw forbidden("Memilih peserta dan menambah tamu hanya bisa dilakukan oleh anggota kelompok.");
  const memberIds = await activeMemberIds(group.id);
  let invitees: string[];
  if (b.invite.mode === "SELECT") {
    invitees = [...new Set(b.invite.personIds)];
    if (invitees.length === 0) throw badRequest("Pilih minimal satu anggota yang diundang.");
    if (invitees.some((id) => !memberIds.has(id))) throw badRequest("Ada nama yang bukan anggota aktif kelompok ini.");
  } else invitees = [...memberIds];
  const guests = uniqueGuests(b.invite.guests);

  const { startsAt, endsAt } = range(b.date, b.startTime, b.endTime);
  // rapat online: ruangan maya, tanpa pemesanan. Tautan, tema, dan pembicara adalah isi rapat, jadi hanya anggota kelompok yang boleh mengisinya.
  const online = !!b.online;
  if (online && !a.caps.isMember) throw forbidden("Tautan, tema, dan pembicara rapat online hanya bisa diisi oleh anggota kelompok.");
  if (!online && !b.roomId) throw badRequest("Pilih ruangan.");
  const roomId = online ? await ensureOnlineRoom(prisma, u.tenantId) : b.roomId!;
  if (!online) {
    await assertRoomUsable(u.tenantId, roomId);
    await assertRoomFree(u.tenantId, roomId, startsAt, endsAt);
  }
  const number = await nextDocNumber(u.tenantId, "RP", startsAt);

  const eventId = randomUUID(); // dibuat dulu: judul, tautan, dan nama tamu dienkripsi terikat ke id rapat
  const onl = await prepareOnline(u.tenantId, eventId, b, "RAPAT");
  const created = await translateOverlap(() =>
    prisma.$transaction(async (tx) => {
      const e = await tx.event.create({
        data: {
          id: eventId, tenantId: u.tenantId, number, kind: "RAPAT", groupId: group.id, title: sealTitle(eventId, b.title), startsAt, endsAt, roomId, ...(onl ?? {}), theme: online ? sealTheme(eventId, b.theme) : null,
          status: "PUBLISHED", publishedAt: new Date(), attendanceMode: "COUNT", createdById: u.userId,
          showTopic: b.showTopic, showAttendees: b.showAttendees, seriesId: opts.seriesId ?? null, seriesIndex: opts.seriesIndex ?? null,
          links: { create: b.links.map((l) => ({ ...sealLink(eventId, l), createdById: u.userId })) },
          participants: {
            create: [
              ...invitees.map((personId) => ({ personId, createdById: u.userId })),
              ...guests.map((g) => ({ guestName: sealGuest(eventId, g), createdById: u.userId })),
            ],
          },
        },
      });
      if (!online) await bookRoom(tx, { tenantId: u.tenantId, roomId, startsAt, endsAt, sourceType: "EVENT", sourceId: e.id });
      return e;
    }),
  "Ruangan sudah dipakai pada jam itu. Pilih ruangan atau jam lain.");
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.create", entity: "Event", entityId: created.id, payload: { number, group: group.name, startsAt: startsAt.toISOString(), online, onBehalf: !a.caps.isMember, invited: invitees.length, guests: guests.length } });
  return getMeeting(u, created.id);
}

export async function updateMeeting(u: AuthUser, id: string, b: z.infer<typeof meetingUpdateBody>) {
  const cur = await loadMeeting(u, id);
  const a = await accessTo(u, cur.group.id);
  if (!a.canManage) throw forbidden("Anda tidak punya hak mengubah rapat ini.");
  if (cur.status === "CANCELLED") throw conflict("Rapat yang sudah dibatalkan tidak bisa diubah.");

  const was = localParts(cur.startsAt);
  const wasEnd = localParts(cur.endsAt);
  const { startsAt, endsAt } = range(b.date ?? was.date, b.startTime ?? was.time, b.endTime ?? wasEnd.time);
  const willBeOnline = b.online ?? cur.isOnline;
  const touchesOnline = b.online !== undefined || b.onlineUrl !== undefined || b.speakerPersonId !== undefined || b.speakerName !== undefined || b.theme !== undefined;
  if (willBeOnline && touchesOnline && !a.caps.isMember) throw forbidden("Tautan, tema, dan pembicara rapat online hanya bisa diisi oleh anggota kelompok.");
  if (!willBeOnline && cur.isOnline && !b.roomId) throw badRequest("Rapat tidak lagi online: pilih ruangannya.");
  const roomId = willBeOnline ? await ensureOnlineRoom(prisma, u.tenantId) : (b.roomId ?? cur.roomId);
  const timeChanged = startsAt.getTime() !== cur.startsAt.getTime() || endsAt.getTime() !== cur.endsAt.getTime();
  const roomChanged = roomId !== cur.roomId;
  if (roomChanged && !willBeOnline) await assertRoomUsable(u.tenantId, roomId);
  if ((timeChanged || roomChanged) && !willBeOnline) await assertRoomFree(u.tenantId, roomId, startsAt, endsAt, id);
  // isian online: tautan wajib; yang tidak dikirim dipertahankan dari rapat ini (rapat sudah online) supaya mengubah jam saja tidak menghapusnya
  const keepSpeaker = b.speakerPersonId === undefined && b.speakerName === undefined;
  const onl = willBeOnline && cur.isOnline && !touchesOnline ? undefined
    : willBeOnline ? await prepareOnline(u.tenantId, id, {
        online: true,
        onlineUrl: b.onlineUrl !== undefined ? b.onlineUrl : cur.onlineUrl ? openOnlineUrl(id, cur.onlineUrl) : null,
        speakerPersonId: keepSpeaker ? cur.speakerPersonId : b.speakerPersonId ?? null,
        speakerName: keepSpeaker ? (cur.speakerName ? openSpeaker(id, cur.speakerName) : null) : b.speakerName ?? null,
      }, "RAPAT")
    : b.online === false ? NOT_ONLINE : undefined;
  const themeData = !willBeOnline ? (cur.isOnline ? null : undefined) : b.theme !== undefined ? sealTheme(id, b.theme) : undefined;

  await translateOverlap(() =>
    prisma.$transaction(async (tx) => {
      await tx.event.update({ where: { id }, data: { title: b.title !== undefined ? sealTitle(id, b.title) : undefined, startsAt, endsAt, roomId, ...(onl ?? {}), theme: themeData, showTopic: b.showTopic, showAttendees: b.showAttendees } });
      if (timeChanged || roomChanged) {
        await releaseBookings(tx, { sourceType: "EVENT", sourceId: id, resourceType: "ROOM" });
        if (!willBeOnline) await bookRoom(tx, { tenantId: u.tenantId, roomId, startsAt, endsAt, sourceType: "EVENT", sourceId: id });
      }
    }),
  "Ruangan sudah dipakai pada jam itu. Pilih ruangan atau jam lain.");
  // tautan, tema, dan nama pembicara tidak pernah dicatat di log; hanya bahwa rapat jadi online / berubah
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.update", entity: "Event", entityId: id, payload: { ...b, title: undefined, titleChanged: b.title !== undefined, onlineUrl: undefined, speakerName: undefined, speakerPersonId: undefined, theme: undefined, themeChanged: b.theme !== undefined, onlineLinkChanged: b.onlineUrl !== undefined, speakerChanged: b.speakerPersonId !== undefined || b.speakerName !== undefined } }); // isi judul tidak dicatat di log
  return getMeeting(u, id);
}

export async function cancelMeeting(u: AuthUser, id: string, reason: string, scope: "ONE" | "FOLLOWING" = "ONE") {
  const cur = await loadMeeting(u, id);
  const a = await accessTo(u, cur.group.id);
  if (!a.canManage) throw forbidden("Anda tidak punya hak membatalkan rapat ini.");
  if (cur.status === "CANCELLED") throw conflict("Rapat ini sudah dibatalkan.");
  // "ini dan seterusnya": rapat ini + semua rapat berikutnya dalam seri yang belum dibatalkan
  const ids = scope === "FOLLOWING" && cur.seriesId
    ? (await prisma.event.findMany({ where: { seriesId: cur.seriesId, deletedAt: null, status: { not: "CANCELLED" }, startsAt: { gte: cur.startsAt } }, select: { id: true } })).map((x) => x.id)
    : [id];
  await prisma.$transaction(async (tx) => {
    for (const eid of ids) {
      await tx.event.update({ where: { id: eid }, data: { status: "CANCELLED", cancelReason: sealReason(eid, reason) } });
      await releaseBookings(tx, { sourceType: "EVENT", sourceId: eid }); // ruangan langsung bebas
    }
  });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.cancel", entity: "Event", entityId: id, payload: { scope, count: ids.length, hasReason: !!reason } }); // alasan tidak dicatat di log
  return getMeeting(u, id);
}

// ───────── Tautan lampiran (hanya anggota) ─────────
async function requireAttach(u: AuthUser, id: string) {
  const cur = await loadMeeting(u, id);
  const a = await accessTo(u, cur.group.id);
  if (!a.caps.isMember || !(a.caps.canSchedule || a.caps.canWriteMinutes)) throw forbidden("Hanya anggota kelompok yang boleh mengatur lampiran.");
  if (cur.status === "CANCELLED") throw conflict("Rapat ini sudah dibatalkan.");
  return cur;
}

export async function addLink(u: AuthUser, id: string, b: z.infer<typeof linkBody>) {
  await requireAttach(u, id);
  const l = await prisma.meetingLink.create({ data: { eventId: id, ...sealLink(id, b), createdById: u.userId } });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.link.add", entity: "Event", entityId: id, payload: {} });
  return { id: l.id, title: b.title, url: b.url };
}

export async function removeLink(u: AuthUser, id: string, linkId: string) {
  await requireAttach(u, id);
  const l = await prisma.meetingLink.findFirst({ where: { id: linkId, eventId: id, deletedAt: null } });
  if (!l) throw notFound("Tautan");
  await prisma.meetingLink.update({ where: { id: linkId }, data: { deletedAt: new Date() } });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.link.remove", entity: "Event", entityId: id, payload: {} });
}

// ───────── Peringatan jadwal ganda anggota ─────────
/**
 * Anggota kelompok yang sudah bertugas di acara lain pada jam itu. Hanya peringatan; rapat tetap boleh disimpan.
 * Nama hanya dibuka untuk anggota kelompok; Penjadwal global hanya melihat jumlahnya.
 */
export async function memberClashes(u: AuthUser, q: { groupId: string; date: string; startTime: string; endTime: string; excludeEventId?: string; personIds?: string[] }) {
  const a = await accessTo(u, q.groupId);
  if (!a.canManage) throw forbidden("Anda tidak punya hak menjadwalkan rapat untuk kelompok ini.");
  const { startsAt, endsAt } = range(q.date, q.startTime, q.endTime);
  const members = await prisma.groupMember.findMany({
    where: { groupId: q.groupId, leftAt: null, person: { deletedAt: null }, ...(q.personIds?.length ? { personId: { in: q.personIds } } : {}) },
    select: { personId: true, person: { select: { name: true } } },
  });
  const map = await personConflicts(u.tenantId, members.map((m) => m.personId), [{ startsAt, endsAt }], q.excludeEventId ? { excludeSource: { sourceType: "EVENT", sourceId: q.excludeEventId } } : {});
  const busy = members.filter((m) => map.has(m.personId));
  return { count: busy.length, total: members.length, names: a.caps.isMember ? busy.map((m) => m.person.name).sort((x, y) => x.localeCompare(y)) : null };
}

// ───────── Undangan dan kehadiran (hanya anggota yang berhak: Penjadwal atau penulis notulen di kelompok itu) ─────────
export async function addParticipants(u: AuthUser, id: string, b: z.infer<typeof addParticipantsBody>) {
  const cur = await requireAttach(u, id);
  const memberIds = await activeMemberIds(cur.group.id);
  const wanted = b.allMembers ? [...memberIds] : [...new Set(b.personIds)];
  if (wanted.some((x) => !memberIds.has(x))) throw badRequest("Ada nama yang bukan anggota aktif kelompok ini.");
  const existing = await prisma.meetingParticipant.findMany({ where: { eventId: id }, select: { personId: true, guestName: true } });
  const haveMembers = new Set(existing.map((x) => x.personId).filter((x): x is string => !!x));
  const haveGuests = new Set(existing.filter((x) => !x.personId).map((x) => (openGuest(id, x.guestName) ?? "").toLowerCase()));
  const newMembers = wanted.filter((x) => !haveMembers.has(x));
  const newGuests = uniqueGuests(b.guests).filter((g) => !haveGuests.has(g.toLowerCase()));
  if (newMembers.length === 0 && newGuests.length === 0) throw badRequest("Tidak ada peserta baru untuk ditambahkan.");
  await prisma.meetingParticipant.createMany({
    data: [...newMembers.map((personId) => ({ eventId: id, personId, createdById: u.userId })), ...newGuests.map((g) => ({ eventId: id, guestName: sealGuest(id, g), createdById: u.userId }))],
  });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.participant.add", entity: "Event", entityId: id, payload: { members: newMembers.length, guests: newGuests.length } });
  return { added: newMembers.length + newGuests.length };
}

export async function setAttendance(u: AuthUser, id: string, participantId: string, b: z.infer<typeof attendanceBody>) {
  await requireAttach(u, id);
  const p = await prisma.meetingParticipant.findFirst({ where: { id: participantId, eventId: id } });
  if (!p) throw notFound("Peserta");
  await prisma.meetingParticipant.update({
    where: { id: participantId },
    data: { status: b.status, respondedAt: b.status === "INVITED" ? null : new Date(), ...(b.note !== undefined ? { note: sealNote(id, b.note) } : {}) },
  });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.participant.attend", entity: "Event", entityId: id, payload: { participantId, from: p.status, to: b.status } });
  return { id: participantId, status: b.status };
}

/** Tandai sekaligus semua peserta yang belum dicatat (mis. "semua hadir"), lalu sisanya dikoreksi satu per satu. */
export async function bulkAttendance(u: AuthUser, id: string, b: z.infer<typeof bulkAttendanceBody>) {
  await requireAttach(u, id);
  const r = await prisma.meetingParticipant.updateMany({ where: { eventId: id, status: "INVITED" }, data: { status: b.status, respondedAt: new Date() } });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.participant.bulk", entity: "Event", entityId: id, payload: { status: b.status, count: r.count } });
  return { updated: r.count };
}

export async function removeParticipant(u: AuthUser, id: string, participantId: string) {
  await requireAttach(u, id);
  const p = await prisma.meetingParticipant.findFirst({ where: { id: participantId, eventId: id }, include: { person: { select: { name: true } } } });
  if (!p) throw notFound("Peserta");
  await prisma.meetingParticipant.delete({ where: { id: participantId } });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.participant.remove", entity: "Event", entityId: id, payload: { guest: !p.personId } }); // nama tidak dicatat di log
}

/** Simpan sekaligus semua perubahan dari halaman rapat. Semuanya berhasil atau tidak sama sekali. */
export async function applyMeetingChanges(u: AuthUser, id: string, b: z.infer<typeof changesBody>) {
  const cur = await requireAttach(u, id);
  const existing = await prisma.meetingParticipant.findMany({ where: { eventId: id }, select: { id: true, personId: true, guestName: true, status: true } });
  const byId = new Map(existing.map((x) => [x.id, x]));
  if (b.remove.some((x) => !byId.has(x)) || b.attendance.some((x) => !byId.has(x.id))) {
    throw conflict("Daftar peserta sudah diubah orang lain. Muat ulang halaman, lalu ulangi perubahan Anda.");
  }
  const removeSet = new Set(b.remove);

  const memberIds = await activeMemberIds(cur.group.id);
  const wantMembers = b.addAllMembers ? [...memberIds].map((personId) => ({ personId, status: "INVITED" as const })) : b.addMembers;
  if (wantMembers.some((x) => !memberIds.has(x.personId))) throw badRequest("Ada nama yang bukan anggota aktif kelompok ini.");
  const keptMembers = new Set(existing.filter((x) => x.personId && !removeSet.has(x.id)).map((x) => x.personId as string));
  const keptGuests = new Set(existing.filter((x) => !x.personId && !removeSet.has(x.id)).map((x) => (openGuest(id, x.guestName) ?? "").toLowerCase()));
  const newMembers = [...new Map(wantMembers.map((x) => [x.personId, x])).values()].filter((x) => !keptMembers.has(x.personId));
  const newGuests = [...new Map(b.addGuests.map((x) => [x.name.toLowerCase(), x])).values()].filter((x) => !keptGuests.has(x.name.toLowerCase()));

  const links = b.linkRemove.length
    ? await prisma.meetingLink.findMany({ where: { id: { in: b.linkRemove }, eventId: id, deletedAt: null }, select: { id: true } })
    : [];
  if (links.length !== new Set(b.linkRemove).size) throw conflict("Tautan sudah diubah orang lain. Muat ulang halaman, lalu ulangi perubahan Anda.");

  const attendance = b.attendance.filter((x) => !removeSet.has(x.id) && byId.get(x.id)!.status !== x.status);
  const total = removeSet.size + attendance.length + newMembers.length + newGuests.length + b.linkAdd.length + links.length;
  if (total === 0) throw badRequest("Tidak ada perubahan untuk disimpan.");

  const now = new Date();
  const responded = (st: string) => (st === "INVITED" ? null : now);
  await prisma.$transaction(async (tx) => {
    if (removeSet.size) await tx.meetingParticipant.deleteMany({ where: { id: { in: [...removeSet] }, eventId: id } });
    for (const a of attendance) await tx.meetingParticipant.update({ where: { id: a.id }, data: { status: a.status, respondedAt: responded(a.status) } });
    if (newMembers.length || newGuests.length) {
      await tx.meetingParticipant.createMany({
        data: [
          ...newMembers.map((m) => ({ eventId: id, personId: m.personId, status: m.status, respondedAt: responded(m.status), createdById: u.userId })),
          ...newGuests.map((g) => ({ eventId: id, guestName: sealGuest(id, g.name), status: g.status, respondedAt: responded(g.status), createdById: u.userId })),
        ],
      });
    }
    if (links.length) await tx.meetingLink.updateMany({ where: { id: { in: links.map((l) => l.id) }, eventId: id }, data: { deletedAt: now } });
    if (b.linkAdd.length) await tx.meetingLink.createMany({ data: b.linkAdd.map((l) => ({ eventId: id, ...sealLink(id, l), createdById: u.userId })) });
  });
  const summary = { removed: removeSet.size, attendance: attendance.length, added: newMembers.length + newGuests.length, linksAdded: b.linkAdd.length, linksRemoved: links.length };
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.changes", entity: "Event", entityId: id, payload: summary });
  return summary;
}

// ───────── Rapat berulang ─────────
async function seriesContext(u: AuthUser, b: Pick<z.infer<typeof meetingCreateBody>, "groupId" | "date" | "startTime" | "endTime"> & { repeat: z.infer<typeof repeatBody> }) {
  const group = await prisma.meetingGroup.findFirst({ where: { id: b.groupId, tenantId: u.tenantId, deletedAt: null }, select: { id: true, name: true } });
  if (!group) throw notFound("Kelompok");
  const a = await accessTo(u, group.id);
  if (!a.canManage) throw forbidden("Anda tidak punya hak menjadwalkan rapat untuk kelompok ini.");
  if (b.repeat.until && b.repeat.until < b.date) throw badRequest("Tanggal berhenti harus sama dengan atau setelah tanggal rapat pertama.");
  const { dates, capped } = expandDates(b.date, b.repeat.pattern, { count: b.repeat.count, until: b.repeat.until });
  if (dates.length < 2) throw badRequest("Pengulangan ini hanya menghasilkan satu tanggal. Perpanjang tanggal berhenti atau tambah jumlahnya.");
  return { group, dates, capped };
}

export const seriesPreviewBody = z.object({
  groupId: z.string().uuid(), date: z.string().regex(DATE_RE), startTime: z.string().regex(TIME_RE), endTime: z.string().regex(TIME_RE),
  roomId: z.string().uuid().optional(), online: z.boolean().optional(), repeat: repeatBody,
});

/** Pratinjau semua tanggal beserta status ruangan (bebas atau sudah terpakai) sebelum seri dibuat. */
export async function previewSeries(u: AuthUser, b: z.infer<typeof seriesPreviewBody>) {
  const { dates, capped } = await seriesContext(u, b);
  const out: { date: string; free: boolean; reason: string | null }[] = [];
  for (const date of dates) {
    const { startsAt, endsAt } = range(date, b.startTime, b.endTime);
    if (b.online || !b.roomId) { out.push({ date, free: true, reason: null }); continue; } // rapat online tidak memakai ruangan
    try { await assertRoomFree(u.tenantId, b.roomId, startsAt, endsAt); out.push({ date, free: true, reason: null }); }
    catch (e) { if (e instanceof ApiError && e.status === 409) out.push({ date, free: false, reason: e.message }); else throw e; }
  }
  return { dates: out, capped, max: MAX_OCCURRENCES };
}

/**
 * Buat rapat berulang: satu rapat per tanggal (rapat biasa yang bisa diubah atau dibatalkan sendiri-sendiri).
 * Tanggal yang ruangannya sudah terpakai dilewati dan dilaporkan. Lampiran hanya dipasang di rapat pertama; undangan berlaku untuk semua.
 */
export async function createMeetingSeries(u: AuthUser, b: z.infer<typeof meetingCreateBody>) {
  if (!b.repeat) return createMeeting(u, b);
  const { group, dates } = await seriesContext(u, { ...b, repeat: b.repeat });
  const { weekday, ordinal } = describeFirst(b.date);
  const series = await prisma.meetingSeries.create({
    data: { tenantId: u.tenantId, groupId: group.id, pattern: b.repeat.pattern, weekday, ordinal: b.repeat.pattern === "MONTHLY_NTH" ? ordinal : null, total: dates.length, untilDate: b.repeat.until ?? null, createdById: u.userId },
  });
  const created: { id: string; number: string; date: string }[] = [];
  const skipped: { date: string; reason: string }[] = [];
  let firstDto: Awaited<ReturnType<typeof createMeeting>> | null = null;
  for (let i = 0; i < dates.length; i++) {
    try {
      const dto = await createMeeting(u, { ...b, date: dates[i], repeat: undefined, links: i === 0 ? b.links : [] }, { seriesId: series.id, seriesIndex: i + 1 });
      created.push({ id: dto.id, number: dto.number, date: dates[i] });
      firstDto ??= dto;
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.status !== 409) {
        if (created.length === 0) { await prisma.meetingSeries.delete({ where: { id: series.id } }); throw e; } // kesalahan isian: hentikan, bukan bentrok
      }
      skipped.push({ date: dates[i], reason: e.message });
    }
  }
  if (!firstDto) {
    await prisma.meetingSeries.delete({ where: { id: series.id } });
    throw conflict("Ruangan sudah terpakai pada semua tanggal itu. Pilih ruangan atau jam lain.");
  }
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.series.create", entity: "MeetingSeries", entityId: series.id, payload: { group: group.name, pattern: b.repeat.pattern, created: created.length, skipped: skipped.length } });
  return { ...firstDto, seriesResult: { created: created.length, skipped } };
}
