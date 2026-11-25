import { prisma } from "./prisma";
import { STAFF_AUDIENCES } from "./notifyAudience";
import { ROLE_LABEL } from "./ui";

/**
 * Menerjemahkan satu catatan log (aksi, objek, isi) menjadi kalimat yang bisa dibaca orang:
 *  - target  = "apa/siapa yang dikenai" (nama, bukan ID)
 *  - how     = "bagaimana" (isi perubahan, tanpa ID)
 * Isi rapat tidak pernah ikut: rapat hanya disebut dengan nama kelompok dan tanggalnya.
 */
export type AuditRowIn = { action: string; entity: string; entityId: string; reason: string | null; payload: unknown };

const TZ = "Asia/Jakarta";
const fmtDate = (d: Date | string) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(new Date(d));
export const fmtTime = (d: Date | string) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d)).replace(".", ":");
export const fmtDay = fmtDate;
export const fmtDateTime = (d: Date | string) => `${fmtDate(d)} ${fmtTime(d)}`;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

// ───────── id yang perlu diterjemahkan ─────────
export type Wanted = Record<"persons" | "events" | "assignments" | "rehearsals" | "teams" | "ministries" | "positions" | "groups" | "templates" | "users" | "regs" | "rooms" | "cg" | "series", Set<string>>;
const emptyWanted = (): Wanted => ({ persons: new Set(), events: new Set(), assignments: new Set(), rehearsals: new Set(), teams: new Set(), ministries: new Set(), positions: new Set(), groups: new Set(), templates: new Set(), users: new Set(), regs: new Set(), rooms: new Set(), cg: new Set(), series: new Set() });

const ENTITY_KEY: Record<string, keyof Wanted> = {
  Event: "events", Person: "persons", MeetingGroup: "groups", EventAssignment: "assignments", RehearsalSession: "rehearsals", User: "users",
  EventTemplate: "templates", TeamType: "teams", Ministry: "ministries", RegistrationRequest: "regs", CgGroup: "cg", MeetingSeries: "series", rooms: "rooms",
};

export function wantedOf(rows: AuditRowIn[]): Wanted {
  const w = emptyWanted();
  for (const r of rows) {
    const k = ENTITY_KEY[r.entity];
    if (k) w[k].add(r.entityId);
    const p = isObj(r.payload) ? r.payload : {};
    for (const key of ["personId", "previousPersonId"]) { const v = str(p[key]); if (v) w.persons.add(v); }
    for (const v of arr(p.personIds)) w.persons.add(v);
    for (const key of ["eventId", "sourceEventId"]) { const v = str(p[key]); if (v) w.events.add(v); }
    for (const v of arr(p.events)) w.events.add(v);
    const t = str(p.teamTypeId); if (t) w.teams.add(t);
    const rm = str(p.roomId); if (rm) w.rooms.add(rm);
    const mi = str(p.ministryId); if (mi) w.ministries.add(mi);
    if (r.action === "person.ministries") for (const v of [...arr(p.add), ...arr(p.remove)]) w.ministries.add(v);
    for (const v of arr(p.positionIds)) w.positions.add(v);
  }
  return w;
}

export type Refs = {
  persons: Map<string, string>;
  events: Map<string, { kind: string; title: string; number: string; startsAt: Date; group: string | null }>;
  assignments: Map<string, { ministry: string; slotNo: number; eventId: string }>;
  rehearsals: Map<string, { eventId: string; seq: number; startsAt: Date }>;
  names: Record<"teams" | "ministries" | "positions" | "groups" | "templates" | "rooms" | "cg", Map<string, string>>;
  users: Map<string, string>;
  regs: Map<string, string>;
  series: Map<string, string>;
};

const byName = (rows: { id: string; name: string }[]) => new Map(rows.map((r) => [r.id, r.name]));

export async function loadRefs(tenantId: string, w: Wanted): Promise<Refs> {
  const ids = (s: Set<string>) => [...s];
  // kursi dan sesi latihan menyebut acara; muat dulu supaya acaranya ikut diterjemahkan
  const [asg, reh] = await Promise.all([
    w.assignments.size ? prisma.eventAssignment.findMany({ where: { id: { in: ids(w.assignments) }, tenantId }, select: { id: true, slotNo: true, eventId: true, ministry: { select: { name: true } } } }) : [],
    w.rehearsals.size ? prisma.rehearsalSession.findMany({ where: { id: { in: ids(w.rehearsals) }, tenantId }, select: { id: true, seq: true, eventId: true, startsAt: true } }) : [],
  ]);
  for (const a of asg) w.events.add(a.eventId);
  for (const r of reh) w.events.add(r.eventId);

  const [persons, events, teams, ministries, positions, groups, templates, rooms, cg, users, regs, series] = await Promise.all([
    w.persons.size ? prisma.person.findMany({ where: { id: { in: ids(w.persons) }, tenantId }, select: { id: true, name: true } }) : [],
    w.events.size ? prisma.event.findMany({ where: { id: { in: ids(w.events) }, tenantId }, select: { id: true, kind: true, title: true, number: true, startsAt: true, group: { select: { name: true } } } }) : [],
    w.teams.size ? prisma.teamType.findMany({ where: { id: { in: ids(w.teams) }, tenantId }, select: { id: true, name: true } }) : [],
    w.ministries.size ? prisma.ministry.findMany({ where: { id: { in: ids(w.ministries) }, tenantId }, select: { id: true, name: true } }) : [],
    w.positions.size ? prisma.groupPosition.findMany({ where: { id: { in: ids(w.positions) } }, select: { id: true, name: true } }) : [],
    w.groups.size ? prisma.meetingGroup.findMany({ where: { id: { in: ids(w.groups) }, tenantId }, select: { id: true, name: true } }) : [],
    w.templates.size ? prisma.eventTemplate.findMany({ where: { id: { in: ids(w.templates) }, tenantId }, select: { id: true, name: true } }) : [],
    w.rooms.size ? prisma.room.findMany({ where: { id: { in: ids(w.rooms) }, tenantId }, select: { id: true, name: true } }) : [],
    w.cg.size ? prisma.cgGroup.findMany({ where: { id: { in: ids(w.cg) }, tenantId }, select: { id: true, name: true } }) : [],
    w.users.size ? prisma.user.findMany({ where: { id: { in: ids(w.users) }, tenantId }, select: { id: true, email: true, person: { select: { name: true } } } }) : [],
    w.regs.size ? prisma.registrationRequest.findMany({ where: { id: { in: ids(w.regs) }, tenantId }, select: { id: true, name: true } }) : [],
    w.series.size ? prisma.meetingSeries.findMany({ where: { id: { in: ids(w.series) }, tenantId }, select: { id: true, groupId: true } }) : [],
  ]);
  const seriesGroups = series.length ? byName(await prisma.meetingGroup.findMany({ where: { id: { in: series.map((s) => s.groupId) }, tenantId }, select: { id: true, name: true } })) : new Map<string, string>();

  return {
    persons: byName(persons),
    events: new Map(events.map((e) => [e.id, { kind: e.kind, title: e.title, number: e.number, startsAt: e.startsAt, group: e.group?.name ?? null }])),
    assignments: new Map(asg.map((a) => [a.id, { ministry: a.ministry.name, slotNo: a.slotNo, eventId: a.eventId }])),
    rehearsals: new Map(reh.map((r) => [r.id, { eventId: r.eventId, seq: r.seq, startsAt: r.startsAt }])),
    names: { teams: byName(teams), ministries: byName(ministries), positions: byName(positions), groups: byName(groups), templates: byName(templates), rooms: byName(rooms), cg: byName(cg) },
    users: new Map(users.map((u) => [u.id, u.person?.name ?? u.email])),
    regs: byName(regs),
    series: new Map(series.map((s) => [s.id, seriesGroups.get(s.groupId) ?? "kelompok"])),
  };
}

// ───────── kalimat ─────────
const GONE = "(sudah dihapus)";
const list = (xs: string[]) => (xs.length ? xs.join(", ") : "-");

/** Nama acara untuk dibaca orang. Rapat: hanya kelompok dan tanggalnya, judul/topik rapat tidak pernah ditampilkan. */
export function eventName(e: { kind: string; title: string; startsAt: Date; group: string | null }): string {
  return e.kind === "RAPAT" ? `Rapat ${e.group ?? ""} · ${fmtDateTime(e.startsAt)}`.replace("Rapat  ·", "Rapat ·") : `${e.title} · ${fmtDateTime(e.startsAt)}`;
}
function eventLabel(refs: Refs, id: string | null): string {
  if (!id) return GONE;
  const e = refs.events.get(id);
  return e ? eventName(e) : `Acara ${GONE}`;
}

const seatLabel = (a: { ministry: string; slotNo: number }) => (a.slotNo > 1 ? `${a.ministry} ${a.slotNo}` : a.ministry);
const STATUS: Record<string, string> = { INVITED: "diundang", PRESENT: "hadir", EXCUSED: "izin", ABSENT: "tidak hadir" };
const PATTERN: Record<string, string> = { WEEKLY: "tiap minggu", BIWEEKLY: "tiap dua minggu", MONTHLY_NTH: "tiap bulan di minggu yang sama", DAILY: "tiap hari" };
const SCOPE: Record<string, string> = { ONE: "hanya rapat ini", FOLLOWING: "rapat ini dan seterusnya" };
const SHEET: Record<string, string> = {
  Pilihan: "Pilihan", Pelayanan: "Pelayanan", Ruangan: "Ruangan", Orang: "Orang", CGLeader: "Pemimpin CG", Akun: "Akun", TemplateAcara: "Template acara",
  TemplateSlot: "Posisi template", KelompokRapat: "Kelompok rapat", JabatanKelompok: "Jabatan kelompok", AnggotaKelompok: "Anggota kelompok",
};
const roleText = (v: unknown) => {
  const xs = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? v.split(",") : [];
  return xs.map((c) => ROLE_LABEL[c.trim()] ?? c.trim()).filter((c) => c && c !== "-").join(", ");
};
const yn = (v: unknown) => (v === true ? "Ya" : "Tidak");

/** Nilai satu perubahan (dari → ke) yang sudah dihitung saat dicatat. */
type Change = { label: string; from: string | null; to: string | null };
function changesText(v: unknown): string | null {
  if (!Array.isArray(v) || !v.length) return null;
  const parts = v.filter(isObj).map((c) => {
    const ch = c as unknown as Change;
    const f = ch.from ?? "kosong", t = ch.to ?? "kosong";
    return `${ch.label}: ${f} → ${t}`;
  });
  return parts.length ? parts.join(" · ") : null;
}

export function describe(r: AuditRowIn, refs: Refs): { target: string | null; how: string | null } {
  const p = isObj(r.payload) ? r.payload : {};
  const a = r.action;
  const person = (id: unknown) => (typeof id === "string" ? refs.persons.get(id) ?? `Orang ${GONE}` : null);
  const persons = (ids: string[]) => ids.map((i) => refs.persons.get(i) ?? `Orang ${GONE}`);
  const name = (m: Map<string, string>, id: unknown) => (typeof id === "string" ? m.get(id) ?? GONE : null);

  // objek yang dikenai
  let target: string | null = null;
  switch (r.entity) {
    case "Event": target = eventLabel(refs, r.entityId); break;
    case "Person": target = refs.persons.get(r.entityId) ?? str(p.name) ?? `Orang ${GONE}`; break;
    case "MeetingGroup": target = refs.names.groups.get(r.entityId) ?? str(p.name) ?? `Kelompok ${GONE}`; break;
    case "EventAssignment": {
      const s = refs.assignments.get(r.entityId);
      target = s ? `${seatLabel(s)} · ${eventLabel(refs, s.eventId)}` : `Posisi ${GONE}`;
      break;
    }
    case "RehearsalSession": {
      const s = refs.rehearsals.get(r.entityId);
      const ev = s ? refs.events.get(s.eventId) : null;
      target = s ? `Latihan ${s.seq} · ${ev ? ev.title : "acara"} · ${fmtDateTime(s.startsAt)}` : `Sesi latihan ${GONE}`;
      break;
    }
    case "User": target = refs.users.get(r.entityId) ?? str(p.email) ?? `Akun ${GONE}`; break;
    case "RegistrationRequest": target = refs.regs.get(r.entityId) ?? str(p.email) ?? GONE; break;
    case "EventTemplate": target = refs.names.templates.get(r.entityId) ?? str(p.name) ?? `Template ${GONE}`; break;
    case "TeamType": target = refs.names.teams.get(r.entityId) ?? str(p.name) ?? `Tim ${GONE}`; break;
    case "Ministry": target = refs.names.ministries.get(r.entityId) ?? str(p.name) ?? `Posisi ${GONE}`; break;
    case "CgGroup": target = refs.names.cg.get(r.entityId) ?? `Kelompok CG ${GONE}`; break;
    case "MeetingSeries": target = `Rapat berulang · ${refs.series.get(r.entityId) ?? "kelompok"}`; break;
    case "Tenant": target = "Profil gereja"; break;
    case "Import": target = "File Excel"; break;
    default: target = str(p.name); // pilihan data (posisi, komunitas, ruangan, kelompok CG)
  }

  // bagaimana
  let how: string | null = null;
  switch (a) {
    case "event.create": how = `Nomor ${str(p.number) ?? "-"}`; break;
    case "event.update": {
      // catatan baru memuat dari → ke; catatan lama hanya memuat isian yang dikirim
      const KEYS: Record<string, string> = { title: "judul", date: "tanggal", startTime: "jam mulai", durationMin: "durasi", roomId: "ruangan", attendanceMode: "mode kehadiran", theme: "tema", padus: "catatan padus" };
      const legacy = Object.keys(p).filter((k) => KEYS[k] && p[k] !== undefined).map((k) => KEYS[k]);
      how = changesText(p.changes) ?? (legacy.length ? `Mengubah ${list(legacy)}` : null);
      break;
    }
    case "event.team.add": case "event.team.remove": how = `Tim ${name(refs.names.teams, p.teamTypeId) ?? ""}`.trim(); break;
    case "event.seat.add": how = `Posisi ${name(refs.names.ministries, p.ministryId) ?? ""}`.trim(); break;
    case "event.band-mode": {
      const m = p.bandMode === "NO_BAND" ? "No Band" : p.bandMode === "BAND" ? "Band" : null;
      const bits = [m ? `Menjadi ${m}` : null, num(p.removed) ? `${p.removed} petugas dilepas` : null, num(p.restored) ? `${p.restored} dipulihkan` : null].filter(Boolean);
      how = bits.length ? bits.join(" · ") : null;
      break;
    }
    case "event.notify": {
      const aud = STAFF_AUDIENCES.find((x) => x.value === p.audience)?.label ?? str(p.audience);
      const bits = [aud ? `Ke ${aud}` : null, num(p.sent) !== null ? `${p.sent} terkirim` : null, num(p.total) !== null ? `dari ${p.total} orang` : null, num(p.noAccount) ? `${p.noAccount} belum punya akun` : null, num(p.failed) ? `${p.failed} gagal` : null].filter(Boolean);
      how = bits.join(" · ") || null;
      break;
    }
    case "assignment.set": {
      const now = person(p.personId);
      const before = person(p.previousPersonId);
      how = now ? (before && before !== now ? `${before} → ${now}` : `Diisi: ${now}`) : before ? `Dikosongkan (sebelumnya ${before})` : "Dikosongkan";
      if (p.mirror === true || p.mirroredFrom) how += " · ikut ibadah pasangan";
      break;
    }
    case "swap.request": case "swap.cancel": case "swap.reject": {
      const who = person(p.personId);
      const bits = [who ? `Pemohon: ${who}` : null, str(p.suggestedName) ? `Usul pengganti: ${p.suggestedName}` : null, str(r.reason) ? `Alasan: ${r.reason}` : null].filter(Boolean);
      how = bits.join(" · ") || null;
      break;
    }
    case "assignment.copy": {
      const bits = [`Dari ${eventLabel(refs, str(p.sourceEventId))}`, num(p.filled) !== null ? `${p.filled} petugas disalin` : null, num(p.sessions) ? `${p.sessions} sesi latihan` : null, num(p.skipped) ? `${p.skipped} dilewati` : null].filter(Boolean);
      how = bits.join(" · ");
      break;
    }
    case "assignment.upload": {
      const cells = isObj(p.cells) ? Object.values(p.cells).filter((x) => x).length : null;
      const evs = arr(p.events).length;
      how = [str(p.format) ? `Format ${p.format}` : null, str(p.date) ? `tanggal ${fmtDate(p.date as string)}` : null, cells !== null ? `${cells} petugas diisi` : null, evs ? `di ${evs} acara` : null].filter(Boolean).join(" · ") || null;
      break;
    }
    case "rehearsal.required": how = `Latihan wajib: ${yn(p.required)}`; break;
    case "rehearsal.required.bulk": how = [`Latihan wajib: ${yn(p.required)}`, num(p.updated) !== null ? `${p.updated} posisi diubah` : null, num(p.blocked) ? `${p.blocked} ditolak` : null].filter(Boolean).join(" · "); break;
    case "rehearsal.create": case "rehearsal.update": case "rehearsal.delete": how = null; break;
    case "booking.override": {
      const who = str(p.personName);
      const conf = arr(p.conflicts);
      const ppl = arr(p.people);
      how = [who ? `Menugaskan ${who}` : null, ppl.length ? `Peserta bentrok: ${list(ppl)}` : null, conf.length ? `Bentrok dengan: ${list(conf)}` : null].filter(Boolean).join(" · ") || null;
      break;
    }
    case "attendance.summary": how = num(p.total) !== null ? `Jumlah hadir ${p.total}` : null; break;
    case "attendance.batch": how = [num(p.added) ? `${p.added} ditandai hadir` : null, num(p.removed) ? `${p.removed} dibatalkan` : null].filter(Boolean).join(" · ") || null; break;
    case "attendance.guest": how = `Tamu baru di ${eventLabel(refs, str(p.eventId))}`; break;
    case "person.create": how = null; break;
    case "person.update": how = "Mengubah data pribadi"; break;
    case "person.ministries": {
      const add = arr(p.add).map((i) => refs.names.ministries.get(i) ?? GONE);
      const rem = arr(p.remove).map((i) => refs.names.ministries.get(i) ?? GONE);
      how = [add.length ? `Menambah: ${list(add)}` : null, rem.length ? `Mencabut: ${list(rem)}` : null].filter(Boolean).join(" · ") || null;
      break;
    }
    case "person.alias": how = null; break;
    case "cg.leaders": how = `Pemimpin: ${list(persons(arr(p.personIds)))}`; break;
    case "user.create": how = [roleText(p.roles) ? `Role: ${roleText(p.roles)}` : "Tanpa role", p.ebmScheduler === true ? "Penjadwal EBM" : null].filter(Boolean).join(" · "); break;
    case "user.update": {
      const bits = [p.roles !== null && p.roles !== undefined ? `Role: ${roleText(p.roles) || "tanpa role"}` : null, p.isActive === true ? "Diaktifkan" : p.isActive === false ? "Dinonaktifkan" : null, p.passwordReset === true ? "Kata sandi direset" : null, p.ebmScheduler === true ? "Penjadwal EBM" : null].filter(Boolean);
      how = bits.join(" · ") || null;
      break;
    }
    case "registration.submit": how = str(p.email); break;
    case "registration.approve": how = [`Ditautkan ke ${person(p.personId) ?? "-"}`, roleText(p.roles) ? `Role: ${roleText(p.roles)}` : "Tanpa role"].join(" · "); break;
    case "group.create": how = [num(p.quorumMin) ? `Kuorum ${p.quorumMin}` : null, str(p.auto) ? `Otomatis (${p.auto})` : null].filter(Boolean).join(" · ") || null; break;
    case "group.update": {
      const f = isObj(p.from) ? p.from : {}, t = isObj(p.to) ? p.to : {};
      const bits = [f.name !== t.name ? `Nama: ${str(f.name) ?? "-"} → ${str(t.name) ?? "-"}` : null, f.quorumMin !== t.quorumMin ? `Kuorum: ${f.quorumMin ?? "tanpa"} → ${t.quorumMin ?? "tanpa"}` : null].filter(Boolean);
      how = bits.join(" · ") || null;
      break;
    }
    case "group.position.create": how = `Jabatan ${str(p.position) ?? ""}${num(p.seats) ? ` (${p.seats} kursi)` : ""}`.trim(); break;
    case "group.position.update": {
      const ch = isObj(p.changes) ? Object.keys(p.changes).length : 0;
      how = `Jabatan ${str(p.position) ?? ""}${ch ? " · mengubah nama, kursi, atau hak" : ""}`.trim();
      break;
    }
    case "group.position.delete": how = `Jabatan ${str(p.position) ?? ""}`.trim(); break;
    case "group.member.add": case "group.member.remove": case "group.member.leave": case "group.member.positions": {
      const who = str(p.name) ?? person(p.personId) ?? "-";
      const pos = arr(p.positionIds).map((i) => refs.names.positions.get(i) ?? GONE);
      const pn = str(p.position);
      how = [who, pos.length ? `jabatan ${list(pos)}` : pn ? `jabatan ${pn}` : null, p.rejoin === true ? "bergabung kembali" : null, str(p.auto) ? `otomatis (${p.auto})` : null].filter(Boolean).join(" · ");
      break;
    }
    case "meeting.create": how = [p.online === true ? "Online" : null, `${num(p.invited) ?? 0} anggota diundang`, num(p.guests) ? `${p.guests} tamu` : null].filter(Boolean).join(" · "); break;
    case "meeting.series.create": how = [str(p.pattern) ? PATTERN[p.pattern as string] ?? (p.pattern as string) : null, num(p.created) !== null ? `${p.created} rapat dibuat` : null, num(p.skipped) ? `${p.skipped} tanggal dilewati` : null].filter(Boolean).join(" · "); break;
    case "meeting.update": {
      const labels: [string, string][] = [["titleChanged", "judul"], ["date", "tanggal"], ["startTime", "jam mulai"], ["endTime", "jam selesai"], ["roomId", "ruangan"], ["showTopic", "tampil topik"], ["showAttendees", "tampil peserta"], ["online", "status online"], ["onlineLinkChanged", "tautan online"], ["speakerChanged", "pembicara"], ["themeChanged", "tema"], ["reminderChanged", "pengingat online"]];
      const ch = labels.filter(([k]) => (/Changed$/.test(k) ? p[k] === true : p[k] !== undefined && p[k] !== null)).map(([, l]) => l);
      const room = name(refs.names.rooms, p.roomId);
      how = ch.length ? `Mengubah ${list(ch)}${room ? ` · ruangan ${room}` : ""}` : null;
      break;
    }
    case "meeting.cancel": how = [str(p.scope) ? SCOPE[p.scope as string] ?? null : null, num(p.count) && (p.count as number) > 1 ? `${p.count} rapat` : null, p.hasReason === true ? "disertai alasan" : null].filter(Boolean).join(" · ") || null; break;
    case "meeting.changes": {
      const bits = [num(p.added) ? `${p.added} peserta ditambah` : null, num(p.removed) ? `${p.removed} dihapus` : null, num(p.attendance) ? `${p.attendance} kehadiran dicatat` : null, num(p.linksAdded) ? `${p.linksAdded} tautan ditambah` : null, num(p.linksRemoved) ? `${p.linksRemoved} tautan dihapus` : null].filter(Boolean);
      how = bits.join(" · ") || null;
      break;
    }
    case "meeting.participant.add": how = [num(p.members) ? `${p.members} anggota` : null, num(p.guests) ? `${p.guests} tamu` : null].filter(Boolean).join(" · ") || null; break;
    case "meeting.participant.attend": how = `${STATUS[p.from as string] ?? "-"} → ${STATUS[p.to as string] ?? "-"}`; break;
    case "meeting.participant.bulk": how = `${num(p.count) ?? 0} peserta ditandai ${STATUS[p.status as string] ?? "-"}`; break;
    case "meeting.participant.remove": how = p.guest === true ? "Tamu" : "Anggota"; break;
    case "meeting.minutes.create": case "meeting.minutes.save": how = num(p.chars) !== null ? `${p.chars} karakter` : null; break; // isi notulen tidak ditampilkan
    case "meeting.minutes.finalize": how = num(p.version) !== null ? `Versi ${p.version}` : null; break;
    case "meeting.minutes.revise": how = [num(p.version) !== null ? `Menjadi versi ${p.version}` : null, p.hasReason === true ? "disertai alasan" : null].filter(Boolean).join(" · ") || null; break;
    case "church.profile.update": how = str(p.name) ? `Nama gereja: ${p.name}` : null; break;
    case "template.generate": {
      const bits = [num(p.created) !== null ? `${p.created} acara dibuat` : null, num(p.skipped) ? `${p.skipped} dilewati` : null].filter(Boolean);
      how = bits.join(" · ") || null;
      break;
    }
    case "import.apply": {
      const bits = Object.entries(p).filter(([, v]) => isObj(v)).map(([k, v]) => {
        const o = v as Obj;
        return `${SHEET[k] ?? k}: ${num(o.dibuat) ?? 0} dibuat${num(o.dilewati) ? `, ${o.dilewati} dilewati` : ""}${num(o.error) ? `, ${o.error} salah` : ""}`;
      });
      how = bits.join(" · ") || null;
      break;
    }
    default: {
      // jenis lain (tim, posisi pelayanan, template, pilihan data): cukup nama bila ada
      const n = str(p.name);
      how = n && n !== target ? n : null;
    }
  }
  return { target, how };
}

/** Peran akun pembuat catatan, untuk kolom "siapa". */
export async function loadRoleLabels(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(userIds)];
  if (!ids.length) return out;
  const rows = await prisma.userRole.findMany({ where: { userId: { in: ids } }, select: { userId: true, role: { select: { code: true } } } });
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(r.userId, [...(by.get(r.userId) ?? []), ROLE_LABEL[r.role.code] ?? r.role.code]);
  for (const [id, roles] of by) out.set(id, [...new Set(roles)].join(", "));
  return out;
}
