import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { nameKey } from "../names";
import { isYesNo, k, parseDate, parseInt0, parseTime, splitList, yes, type Credential, type Ctx, type Row } from "./common";

export type Named = { id: string; name: string; isNew: boolean; deleted?: boolean; revive?: boolean };
export type RoomRec = Named & { active: boolean };
export type MinRec = Named & { teamId: string; rehearsal: boolean };
export type PersonRec = {
  id: string; name: string; key: string; isNew: boolean; cgId: string | null; hasUser: boolean; ministryIds: Set<string>;
  data?: Prisma.PersonCreateManyInput; // hanya untuk orang baru
};
export type TplRec = Named & { slots: Map<string, { count: number; rehearsal: boolean }>; mode: "COUNT" | "NAMES"; reused: boolean };

export type Master = {
  positions: Map<string, Named>;
  cgs: Map<string, Named>;
  communities: Map<string, Named>;
  teams: Map<string, Named>;
  rooms: Map<string, RoomRec>;
  ministries: Map<string, MinRec[]>; // kunci: nama pelayanan (bisa sama di beda tim)
  persons: Map<string, PersonRec>; // kunci: nameKey
  templates: Map<string, TplRec>;
  emails: Set<string>;
  roleIds: Map<string, string>;
  leaders: Set<string>; // pasangan "cgId|personId" yang sudah ada
};

type W = {
  positions: Prisma.PersonPositionCreateManyInput[]; positionRevive: string[];
  cgs: Prisma.CgGroupCreateManyInput[]; cgRevive: string[];
  communities: Prisma.CommunityCreateManyInput[]; communityRevive: string[];
  teams: Prisma.TeamTypeCreateManyInput[]; teamRevive: string[];
  rooms: Prisma.RoomCreateManyInput[]; roomRevive: { id: string; active: boolean }[];
  ministries: Prisma.MinistryCreateManyInput[]; ministryRevive: { id: string; rehearsal: boolean }[];
  personMinistries: Prisma.PersonMinistryCreateManyInput[];
  personCommunities: Prisma.PersonCommunityCreateManyInput[];
  cgUpdates: Map<string, string>; // personId (yang sudah ada) → cgId
  leaders: Prisma.CgLeaderCreateManyInput[];
  users: Prisma.UserCreateManyInput[]; userRoles: Prisma.UserRoleCreateManyInput[];
  templates: Prisma.EventTemplateCreateManyInput[]; templateRevive: { id: string; data: Prisma.EventTemplateUncheckedUpdateInput }[];
  slots: Prisma.EventTemplateSlotCreateManyInput[]; clearSlots: string[];
};

export type MasterState = { M: Master; W: W; credentials: Credential[] };

const GENDER: Record<string, "L" | "P"> = { l: "L", p: "P", laki: "L", "laki laki": "L", pria: "L", perempuan: "P", wanita: "P" };
const DAYS: Record<string, number> = { minggu: 0, ahad: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, sabtu: 6 };
const ROLE_MAP: Record<string, { code: string; label: string }> = {
  penjadwal: { code: "PENJADWAL", label: "Penjadwal" },
  "admin tim": { code: "ADMIN_TIM", label: "Admin Tim" },
  "petugas absen": { code: "PETUGAS_ABSEN", label: "Petugas Absen" },
  pelayan: { code: "PELAYAN", label: "Pelayan" },
};
const PW_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const genPassword = () => Array.from({ length: 10 }, () => PW_CHARS[randomInt(PW_CHARS.length)]).join("");

const find = <T extends Named>(m: Map<string, T>, name: string) => {
  const e = m.get(k(name));
  return e && !e.deleted ? e : undefined;
};

/** Muat data yang sudah ada supaya sheet bisa dicocokkan dan data dobel dilewati. */
export async function loadMaster(tenantId: string): Promise<MasterState> {
  const [pos, cgs, comms, teams, rooms, mins, persons, tpls, users, roles, pm, leaders] = await Promise.all([
    prisma.personPosition.findMany({ where: { tenantId } }),
    prisma.cgGroup.findMany({ where: { tenantId } }),
    prisma.community.findMany({ where: { tenantId } }),
    prisma.teamType.findMany({ where: { tenantId } }),
    prisma.room.findMany({ where: { tenantId } }),
    prisma.ministry.findMany({ where: { tenantId } }),
    prisma.person.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true, nameKey: true, cgGroupId: true, user: { select: { id: true } } } }),
    prisma.eventTemplate.findMany({ where: { tenantId }, include: { slots: true } }),
    prisma.user.findMany({ where: { tenantId }, select: { email: true } }),
    prisma.role.findMany({ where: { tenantId }, select: { id: true, code: true } }),
    prisma.personMinistry.findMany({ where: { person: { tenantId, deletedAt: null } }, select: { personId: true, ministryId: true } }),
    prisma.cgLeader.findMany({ where: { cgGroup: { tenantId } }, select: { cgGroupId: true, personId: true } }),
  ]);
  const named = <T extends { id: string; name: string; deletedAt: Date | null }>(rows: T[]) =>
    new Map(rows.map((r) => [k(r.name), { id: r.id, name: r.name, isNew: false, deleted: !!r.deletedAt } satisfies Named]));

  const M: Master = {
    positions: named(pos), cgs: named(cgs), communities: named(comms), teams: named(teams),
    rooms: new Map(rooms.map((r) => [k(r.name), { id: r.id, name: r.name, isNew: false, deleted: !!r.deletedAt, active: r.isActive }])),
    ministries: new Map(),
    persons: new Map(),
    templates: new Map(),
    emails: new Set(users.map((x) => x.email.toLowerCase())),
    roleIds: new Map(roles.map((r) => [r.code, r.id])),
    leaders: new Set(leaders.map((l) => `${l.cgGroupId}|${l.personId}`)),
  };
  for (const m of mins) {
    const list = M.ministries.get(k(m.name)) ?? [];
    list.push({ id: m.id, name: m.name, isNew: false, deleted: !!m.deletedAt, teamId: m.teamTypeId, rehearsal: m.rehearsalRequiredDefault });
    M.ministries.set(k(m.name), list);
  }
  const pmBy = new Map<string, Set<string>>();
  for (const x of pm) pmBy.set(x.personId, (pmBy.get(x.personId) ?? new Set()).add(x.ministryId));
  for (const p of persons) {
    if (M.persons.has(p.nameKey)) continue;
    M.persons.set(p.nameKey, { id: p.id, name: p.name, key: p.nameKey, isNew: false, cgId: p.cgGroupId, hasUser: !!p.user, ministryIds: pmBy.get(p.id) ?? new Set() });
  }
  for (const t of tpls) {
    const slots = new Map<string, { count: number; rehearsal: boolean }>();
    for (const s of t.slots) {
      const cur = slots.get(s.ministryId);
      if (cur) cur.count++;
      else slots.set(s.ministryId, { count: 1, rehearsal: s.rehearsalRequired });
    }
    M.templates.set(k(t.name), { id: t.id, name: t.name, isNew: false, deleted: !!t.deletedAt, slots, mode: t.attendanceModeDefault === "NAMES" ? "NAMES" : "COUNT", reused: false });
  }
  const W: W = {
    positions: [], positionRevive: [], cgs: [], cgRevive: [], communities: [], communityRevive: [], teams: [], teamRevive: [], rooms: [], roomRevive: [],
    ministries: [], ministryRevive: [], personMinistries: [], personCommunities: [], cgUpdates: new Map(), leaders: [], users: [], userRoles: [],
    templates: [], templateRevive: [], slots: [], clearSlots: [],
  };
  return { M, W, credentials: [] };
}

type EnsureArgs = { ctx: Ctx; sheet: string; row: number; name: string; map: Map<string, Named>; max: number; label: string };
/** Ambil-atau-buat satu entri bernama. Mengembalikan entri baru, atau undefined bila sudah ada / tidak valid. */
function ensure({ ctx, sheet, row, name, map, max, label }: EnsureArgs): Named | undefined {
  const { rep } = ctx;
  rep.seen(sheet);
  const nm = name.trim().replace(/\s+/g, " ");
  if (nm.length > max) { rep.err(sheet, row, `${label} "${nm.slice(0, 30)}…" terlalu panjang (maks ${max} huruf).`); return; }
  const cur = map.get(k(nm));
  if (cur && !cur.deleted) { rep.skip(sheet, row, `${label} "${nm}" sudah ada.`); return; }
  if (cur?.deleted) { cur.deleted = false; cur.revive = true; rep.ok(sheet); return cur; } // hidupkan lagi yang pernah dihapus
  const e: Named = { id: randomUUID(), name: nm, isNew: true };
  map.set(k(nm), e);
  rep.ok(sheet);
  return e;
}

export function findMinistry(M: Master, name: string): { rec?: MinRec; err?: string } {
  const list = (M.ministries.get(k(name)) ?? []).filter((m) => !m.deleted);
  if (!list.length) return { err: `Pelayanan "${name}" belum ada (cek ejaan atau isi sheet Pelayanan).` };
  if (list.length > 1) {
    const teams = new Map([...M.teams.values()].map((t) => [t.id, t.name]));
    return { err: `Pelayanan "${name}" ada di beberapa tim (${list.map((m) => teams.get(m.teamId) ?? "?").join(", ")}), jadi tidak jelas yang mana.` };
  }
  return { rec: list[0] };
}

export function stagePilihan(ctx: Ctx, st: MasterState, rows: Row[]) {
  const { M, W } = st;
  const t = ctx.u.tenantId;
  let sortPos = 1000, sortTeam = 1000;
  const put = (e: Named | undefined, revive: string[], create: (x: Named) => void) => { if (!e) return; if (e.revive) revive.push(e.id); else create(e); };
  for (const r of rows) {
    const base = { ctx, sheet: "Pilihan", row: r.n, max: 80 };
    if (r.v.position) put(ensure({ ...base, name: r.v.position, map: M.positions, label: "Posisi" }), W.positionRevive, (e) => W.positions.push({ id: e.id, tenantId: t, name: e.name, sortOrder: sortPos++ }));
    if (r.v.cg) put(ensure({ ...base, name: r.v.cg, map: M.cgs, label: "Kelompok CG" }), W.cgRevive, (e) => W.cgs.push({ id: e.id, tenantId: t, name: e.name }));
    if (r.v.community) put(ensure({ ...base, name: r.v.community, map: M.communities, label: "Komunitas" }), W.communityRevive, (e) => W.communities.push({ id: e.id, tenantId: t, name: e.name }));
    if (r.v.team) put(ensure({ ...base, name: r.v.team, map: M.teams, label: "Tim" }), W.teamRevive, (e) => W.teams.push({ id: e.id, tenantId: t, name: e.name, sortOrder: sortTeam++ }));
  }
}

export function stagePelayanan(ctx: Ctx, st: MasterState, rows: Row[]) {
  const { M, W } = st;
  const { rep, u } = ctx;
  const seen = new Set<string>();
  let sort = 1000;
  for (const r of rows) {
    rep.seen("Pelayanan");
    const team = find(M.teams, r.v.team);
    const name = r.v.name.trim().replace(/\s+/g, " ");
    if (!r.v.team || !name) { rep.err("Pelayanan", r.n, "Tim dan nama pelayanan wajib diisi."); continue; }
    if (!team) { rep.err("Pelayanan", r.n, `Tim "${r.v.team}" belum ada. Tambahkan di sheet Pilihan, atau cek ejaannya.`); continue; }
    if (name.length > 80) { rep.err("Pelayanan", r.n, "Nama pelayanan terlalu panjang (maks 80 huruf)."); continue; }
    if (!isYesNo(r.v.rehearsal)) { rep.err("Pelayanan", r.n, `"Wajib latihan" harus Ya atau Tidak (isinya "${r.v.rehearsal}").`); continue; }
    const key = `${team.id}|${k(name)}`;
    if (seen.has(key)) { rep.err("Pelayanan", r.n, `"${name}" muncul dua kali di tim ${team.name}.`); continue; }
    seen.add(key);
    const list = M.ministries.get(k(name)) ?? [];
    const same = list.find((m) => m.teamId === team.id);
    const rehearsal = yes(r.v.rehearsal, false);
    if (same && !same.deleted) { rep.skip("Pelayanan", r.n, `"${name}" di ${team.name} sudah ada.`); continue; }
    if (same?.deleted) { same.deleted = false; same.rehearsal = rehearsal; W.ministryRevive.push({ id: same.id, rehearsal }); rep.ok("Pelayanan"); continue; }
    const rec: MinRec = { id: randomUUID(), name, isNew: true, teamId: team.id, rehearsal };
    M.ministries.set(k(name), [...list, rec]);
    W.ministries.push({ id: rec.id, tenantId: u.tenantId, teamTypeId: team.id, name, rehearsalRequiredDefault: rehearsal, sortOrder: sort++ });
    rep.ok("Pelayanan");
  }
}

export function stageRuangan(ctx: Ctx, st: MasterState, rows: Row[]) {
  const { M, W } = st;
  for (const r of rows) {
    if (!isYesNo(r.v.active)) { ctx.rep.seen("Ruangan"); ctx.rep.err("Ruangan", r.n, `"Aktif" harus Ya atau Tidak (isinya "${r.v.active}").`); continue; }
    const e = ensure({ ctx, sheet: "Ruangan", row: r.n, name: r.v.name, map: M.rooms, max: 80, label: "Ruangan" });
    if (!e) continue;
    const active = yes(r.v.active, true);
    (e as RoomRec).active = active;
    if (e.revive) W.roomRevive.push({ id: e.id, active });
    else W.rooms.push({ id: e.id, tenantId: ctx.u.tenantId, name: e.name, isActive: active });
  }
}

export function stageOrang(ctx: Ctx, st: MasterState, rows: Row[]) {
  const { M, W } = st;
  const { rep, u } = ctx;
  const now = new Date();
  for (const r of rows) {
    rep.seen("Orang");
    const name = r.v.name.trim().replace(/\s+/g, " ");
    const errs: string[] = [];
    if (!name) errs.push("Nama wajib diisi.");
    if (name.length > 120) errs.push("Nama terlalu panjang (maks 120 huruf).");
    if (r.v.title.length > 20) errs.push("Gelar terlalu panjang (maks 20 huruf).");
    const gender = GENDER[k(r.v.gender).replace(/-/g, " ")];
    if (!gender) errs.push(`JK harus L atau P (isinya "${r.v.gender}").`);
    const position = r.v.position ? find(M.positions, r.v.position) : undefined;
    if (!r.v.position) errs.push("Posisi di gereja wajib diisi.");
    else if (!position) errs.push(`Posisi "${r.v.position}" belum ada (cek ejaan atau isi sheet Pilihan).`);
    let cg: Named | undefined;
    if (r.v.cg) { cg = find(M.cgs, r.v.cg); if (!cg) errs.push(`Kelompok CG "${r.v.cg}" belum ada.`); }
    const comms: Named[] = [];
    for (const c of splitList(r.v.community)) { const e = find(M.communities, c); if (e) comms.push(e); else errs.push(`Komunitas "${c}" belum ada.`); }
    const mins: MinRec[] = [];
    for (const m of splitList(r.v.ministries)) { const f = findMinistry(M, m); if (f.rec) mins.push(f.rec); else errs.push(f.err!); }
    let birth: Date | null = null;
    if (r.v.birth) {
      const d = parseDate(r.v.birth);
      if (!d) errs.push(`Tanggal lahir "${r.v.birth}" tidak terbaca (pakai format 1990-04-12).`);
      else { birth = new Date(`${d}T00:00:00Z`); if (birth > now) errs.push("Tanggal lahir ada di masa depan."); }
    }
    const o = k(r.v.origin);
    if (o && !["dalam", "luar"].includes(o)) errs.push(`Asal harus Dalam atau Luar (isinya "${r.v.origin}").`);
    const origin = o === "luar" ? "LUAR" : "DALAM";
    if (origin === "LUAR" && !r.v.originChurch) errs.push("Orang dari luar wajib punya Gereja asal.");
    const key = nameKey(name);
    const dup = M.persons.get(key);
    if (dup && !errs.length) {
      if (dup.isNew) errs.push("Nama ini muncul dua kali di file (nama yang sama setelah gelar dibuang).");
      else { rep.skip("Orang", r.n, `${name} sudah ada di data.`); continue; }
    }
    if (errs.length) { rep.err("Orang", r.n, errs.join(" ")); continue; }

    const id = randomUUID();
    const rec: PersonRec = {
      id, name, key, isNew: true, cgId: cg?.id ?? null, hasUser: false, ministryIds: new Set(mins.map((m) => m.id)),
      data: { id, tenantId: u.tenantId, name, nameKey: key, title: r.v.title || null, birthDate: birth, gender: gender!, positionId: position!.id, cgGroupId: cg?.id ?? null, origin, originChurch: origin === "LUAR" ? r.v.originChurch : null },
    };
    M.persons.set(key, rec);
    for (const c of comms) W.personCommunities.push({ personId: id, communityId: c.id });
    for (const m of new Set(mins.map((x) => x.id))) W.personMinistries.push({ personId: id, ministryId: m });
    rep.ok("Orang");
  }
}

export function stageCgLeader(ctx: Ctx, st: MasterState, rows: Row[]) {
  const { M, W } = st;
  const { rep } = ctx;
  const cgName = (id: string) => [...M.cgs.values()].find((c) => c.id === id)?.name ?? "CG lain";
  const seen = new Set<string>();
  for (const r of rows) {
    rep.seen("CGLeader");
    const cg = find(M.cgs, r.v.cg);
    if (!r.v.cg || !r.v.person) { rep.err("CGLeader", r.n, "Kelompok CG dan nama leader wajib diisi."); continue; }
    if (!cg) { rep.err("CGLeader", r.n, `Kelompok CG "${r.v.cg}" belum ada.`); continue; }
    const p = M.persons.get(nameKey(r.v.person));
    if (!p) { rep.err("CGLeader", r.n, `"${r.v.person}" belum ada di data Orang.`); continue; }
    const pair = `${cg.id}|${p.id}`;
    if (seen.has(pair)) { rep.err("CGLeader", r.n, `${p.name} dobel sebagai leader ${cg.name}.`); continue; }
    seen.add(pair);
    if (M.leaders.has(pair)) { rep.skip("CGLeader", r.n, `${p.name} sudah menjadi leader ${cg.name}.`); continue; }
    if (p.cgId && p.cgId !== cg.id) { rep.err("CGLeader", r.n, `${p.name} anggota ${cgName(p.cgId)}, bukan ${cg.name}. Leader harus anggota CG-nya.`); continue; }
    if (!p.cgId) {
      p.cgId = cg.id;
      if (p.isNew && p.data) p.data.cgGroupId = cg.id; else W.cgUpdates.set(p.id, cg.id);
      rep.note("CGLeader", r.n, `${p.name} otomatis dimasukkan sebagai anggota ${cg.name}.`);
    }
    W.leaders.push({ cgGroupId: cg.id, personId: p.id });
    rep.ok("CGLeader");
  }
}

export async function stageAkun(ctx: Ctx, st: MasterState, rows: Row[]) {
  const { M, W } = st;
  const { rep, u, apply } = ctx;
  const mailInFile = new Set<string>();
  for (const r of rows) {
    rep.seen("Akun");
    const p = M.persons.get(nameKey(r.v.person));
    const email = r.v.email.trim().toLowerCase();
    const errs: string[] = [];
    if (!r.v.person) errs.push("Nama orang wajib diisi.");
    else if (!p) errs.push(`"${r.v.person}" belum ada di data Orang.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.push(`Email "${r.v.email}" tidak valid.`);
    else if (M.emails.has(email) || mailInFile.has(email)) errs.push(`Email ${email} sudah dipakai akun lain.`);
    const roles: { code: string; label: string }[] = [];
    for (const x of splitList(r.v.role)) {
      const kx = k(x);
      if (["tanpa role", "-", "anggota", "tanpa"].includes(kx)) continue;
      if (kx === "superadmin") { errs.push("Superadmin tidak dibuat lewat impor. Buat manual dari halaman Orang."); continue; }
      const m = ROLE_MAP[kx];
      if (!m) { errs.push(`Role "${x}" tidak dikenal (pilih: Penjadwal, Admin Tim, Petugas Absen, Pelayan, atau Tanpa role).`); continue; }
      if (!M.roleIds.has(m.code)) { errs.push(`Role ${m.label} belum ada di sistem. Jalankan seed.`); continue; }
      roles.push(m);
    }
    let team: Named | undefined;
    if (roles.some((x) => x.code === "ADMIN_TIM")) {
      if (!r.v.team) errs.push("Admin Tim wajib mengisi kolom Tim yang dikelola.");
      else { team = find(M.teams, r.v.team); if (!team) errs.push(`Tim "${r.v.team}" belum ada.`); }
    }
    if (p?.hasUser && !errs.length) { rep.skip("Akun", r.n, `${p.name} sudah punya akun.`); continue; }
    if (errs.length) { rep.err("Akun", r.n, errs.join(" ")); continue; }

    const userId = randomUUID();
    const password = genPassword();
    const passwordHash = apply ? await bcrypt.hash(password, 10) : "preview";
    W.users.push({ id: userId, tenantId: u.tenantId, email, passwordHash, personId: p!.id, mustChangePassword: true });
    for (const ro of roles) W.userRoles.push({ userId, roleId: M.roleIds.get(ro.code)!, teamTypeId: ro.code === "ADMIN_TIM" ? team!.id : null });
    p!.hasUser = true;
    M.emails.add(email);
    mailInFile.add(email);
    if (apply) st.credentials.push({ name: p!.name, email, password, role: roles.map((x) => x.label).join(", ") || "Anggota" });
    rep.ok("Akun");
  }
}

export function stageTemplate(ctx: Ctx, st: MasterState, rows: Row[]) {
  const { M, W } = st;
  const { rep, u } = ctx;
  for (const r of rows) {
    rep.seen("TemplateAcara");
    const name = r.v.name.trim().replace(/\s+/g, " ");
    const errs: string[] = [];
    if (!name) errs.push("Nama template wajib diisi.");
    if (name.length > 80) errs.push("Nama template terlalu panjang (maks 80 huruf).");
    const pat = k(r.v.pattern);
    const recurrence = pat === "mingguan" ? "WEEKLY" : pat === "bulanan" ? "MONTHLY_NTH" : null;
    if (!recurrence) errs.push(`Pola harus Mingguan atau Bulanan (isinya "${r.v.pattern}").`);
    const weekday = DAYS[k(r.v.day).replace(/[^a-z]/g, "")];
    if (weekday === undefined) errs.push(`Hari "${r.v.day}" tidak dikenal (Minggu, Senin, ... Sabtu).`);
    let ordinal: number | null = null;
    if (recurrence === "MONTHLY_NTH") {
      const raw = k(r.v.nth);
      ordinal = raw === "terakhir" ? 5 : parseInt0(raw);
      if (!ordinal || ordinal < 1 || ordinal > 5) errs.push("Pola Bulanan butuh Minggu ke- (1–4, atau 5 = terakhir).");
    }
    const start = parseTime(r.v.start);
    if (!start) errs.push(`Jam mulai "${r.v.start}" tidak terbaca (contoh 09:30).`);
    let dur = 120;
    if (r.v.dur) { const d = parseInt0(r.v.dur); if (d === null || d < 15 || d > 720) errs.push("Durasi harus 15–720 menit."); else dur = d; }
    const room = r.v.room ? find(M.rooms, r.v.room) : undefined;
    if (!r.v.room) errs.push("Ruangan wajib diisi."); else if (!room) errs.push(`Ruangan "${r.v.room}" belum ada.`); else if (!room.active) errs.push(`Ruangan ${room.name} sedang nonaktif.`);
    const mk = k(r.v.mode);
    if (mk && !["jumlah saja", "per nama"].includes(mk)) errs.push(`Mode kehadiran harus "Jumlah saja" atau "Per nama".`);
    const mode = mk === "per nama" ? "NAMES" : "COUNT";
    let comm: Named | undefined;
    if (r.v.community) { comm = find(M.communities, r.v.community); if (!comm) errs.push(`Komunitas "${r.v.community}" belum ada.`); }
    const cur = M.templates.get(k(name));
    if (cur && !cur.deleted && !errs.length) {
      rep.skip("TemplateAcara", r.n, cur.isNew ? `Template "${name}" muncul dua kali di file.` : `Template "${name}" sudah ada.`);
      continue;
    }
    if (errs.length) { rep.err("TemplateAcara", r.n, errs.join(" ")); continue; }

    const data = { name, weekday: weekday!, recurrence: recurrence!, ordinal, startTime: start!, durationMin: dur, roomId: room!.id, attendanceModeDefault: mode, attendanceCommunityId: comm?.id ?? null };
    if (cur?.deleted) {
      cur.deleted = false; cur.isNew = true; cur.reused = true; cur.mode = mode; cur.slots = new Map();
      W.templateRevive.push({ id: cur.id, data: { ...data, deletedAt: null } });
      W.clearSlots.push(cur.id);
    } else {
      const rec: TplRec = { id: randomUUID(), name, isNew: true, slots: new Map(), mode, reused: false };
      M.templates.set(k(name), rec);
      W.templates.push({ id: rec.id, tenantId: u.tenantId, ...data });
    }
    rep.ok("TemplateAcara");
  }
}

export function stageTemplateSlot(ctx: Ctx, st: MasterState, rows: Row[]) {
  const { M, W } = st;
  const { rep } = ctx;
  for (const r of rows) {
    rep.seen("TemplateSlot");
    const tpl = r.v.tpl ? find(M.templates, r.v.tpl) : undefined;
    const errs: string[] = [];
    if (!r.v.tpl) errs.push("Nama template wajib diisi.");
    else if (!tpl) errs.push(`Template "${r.v.tpl}" belum ada (cek ejaan atau isi sheet TemplateAcara).`);
    const f = r.v.ministry ? findMinistry(M, r.v.ministry) : { err: "Pelayanan wajib diisi." };
    if (f.err) errs.push(f.err);
    let count = 1;
    if (r.v.count) { const c = parseInt0(r.v.count); if (c === null || c < 1 || c > 10) errs.push("Jumlah kursi harus 1–10."); else count = c; }
    if (!isYesNo(r.v.rehearsal)) errs.push(`"Wajib latihan" harus Ya atau Tidak.`);
    if (errs.length) { rep.err("TemplateSlot", r.n, errs.join(" ")); continue; }
    if (!tpl!.isNew) { rep.skip("TemplateSlot", r.n, `Template "${tpl!.name}" sudah ada, posisinya tidak diubah.`); continue; }
    if (tpl!.slots.has(f.rec!.id)) { rep.err("TemplateSlot", r.n, `${f.rec!.name} muncul dua kali di template ${tpl!.name}. Pakai Jumlah kursi untuk beberapa kursi.`); continue; }
    const rehearsal = yes(r.v.rehearsal, f.rec!.rehearsal);
    tpl!.slots.set(f.rec!.id, { count, rehearsal });
    for (let i = 1; i <= count; i++) W.slots.push({ templateId: tpl!.id, ministryId: f.rec!.id, slotNo: i, rehearsalRequired: rehearsal });
    rep.ok("TemplateSlot");
  }
}

/** Tulis semua data master dalam satu transaksi: berhasil semua atau tidak sama sekali. */
export async function flushMaster(st: MasterState) {
  const { W, M } = st;
  const live = { deletedAt: null };
  const people = [...M.persons.values()].filter((p) => p.isNew && p.data).map((p) => p.data!);
  await prisma.$transaction(
    async (tx) => {
      if (W.positions.length) await tx.personPosition.createMany({ data: W.positions });
      if (W.positionRevive.length) await tx.personPosition.updateMany({ where: { id: { in: W.positionRevive } }, data: live });
      if (W.cgs.length) await tx.cgGroup.createMany({ data: W.cgs });
      if (W.cgRevive.length) await tx.cgGroup.updateMany({ where: { id: { in: W.cgRevive } }, data: live });
      if (W.communities.length) await tx.community.createMany({ data: W.communities });
      if (W.communityRevive.length) await tx.community.updateMany({ where: { id: { in: W.communityRevive } }, data: live });
      if (W.teams.length) await tx.teamType.createMany({ data: W.teams });
      if (W.teamRevive.length) await tx.teamType.updateMany({ where: { id: { in: W.teamRevive } }, data: live });
      if (W.rooms.length) await tx.room.createMany({ data: W.rooms });
      for (const x of W.roomRevive) await tx.room.update({ where: { id: x.id }, data: { ...live, isActive: x.active } });
      if (W.ministries.length) await tx.ministry.createMany({ data: W.ministries });
      for (const x of W.ministryRevive) await tx.ministry.update({ where: { id: x.id }, data: { ...live, rehearsalRequiredDefault: x.rehearsal } });
      if (people.length) await tx.person.createMany({ data: people });
      if (W.personMinistries.length) await tx.personMinistry.createMany({ data: W.personMinistries, skipDuplicates: true });
      if (W.personCommunities.length) await tx.personCommunity.createMany({ data: W.personCommunities, skipDuplicates: true });
      for (const [personId, cgId] of W.cgUpdates) await tx.person.update({ where: { id: personId }, data: { cgGroupId: cgId } });
      if (W.leaders.length) await tx.cgLeader.createMany({ data: W.leaders, skipDuplicates: true });
      if (W.users.length) await tx.user.createMany({ data: W.users });
      if (W.userRoles.length) await tx.userRole.createMany({ data: W.userRoles });
      if (W.clearSlots.length) await tx.eventTemplateSlot.deleteMany({ where: { templateId: { in: W.clearSlots } } });
      if (W.templates.length) await tx.eventTemplate.createMany({ data: W.templates });
      for (const x of W.templateRevive) await tx.eventTemplate.update({ where: { id: x.id }, data: x.data });
      if (W.slots.length) await tx.eventTemplateSlot.createMany({ data: W.slots });
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
}
