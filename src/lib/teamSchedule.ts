/**
 * Jadwal tahunan per tim: siapkan posisi, pratinjau file, simpan per tanggal, export, dan template.
 * Saat ini hanya format EBM. Satu baris tanggal berlaku untuk dua ibadah (Ibadah Minggu I dan II).
 */
import { z } from "zod";
import { prisma } from "./prisma";
import { ApiError, badRequest, conflict, notFound } from "./errors";
import { can, requirePermission, requireTeamAccess, type AuthUser } from "./rbac";
import { audit } from "./audit";
import { addMinutes, localParts, zonedToUtc } from "./time";
import { promoteOrphanOverrides, releaseBookings } from "./booking";
import { createOnDate, type TplWithSlots } from "./templates";
import { assignCore } from "./assignments";
import { EBM_GROUP, syncEbmGroup } from "./ebmGroup";
import { sundayPair, teamKind } from "./seatRules";
import { nameKey } from "./names";
import { isEditable } from "./eventStatusFlow";
import { FORMATS, MONTHS_ID, matchName, normName, parseTeamSheet, type Candidate, type TeamFormat } from "./teamFormats";
import type { XSheet } from "./importer/xlsx";
import { buildXlsx, type XCell } from "./xlsxWrite";

export const getFormat = (key: string): TeamFormat => {
  const f = FORMATS[key];
  if (!f) throw notFound("Format jadwal");
  return f;
};

export type ExtraSpec = { key: string; ministry: string };

/** Kolom tambahan dari posisi tim yang ada di template Ibadah Minggu tetapi bukan bagian format dasar (mis. pelayanan baru dari unggahan). */
function templateExtras(st: FormatState) {
  const known = new Set([...st.ministries.values()].filter((m) => !!m).map((m) => m!.id));
  const out = new Map<string, string>();
  for (const t of st.templates.values()) for (const sl of t.slots) if (sl.ministry.teamTypeId === st.team.id && !known.has(sl.ministryId)) out.set(sl.ministryId, sl.ministry.name);
  return [...out.entries()].map(([id, name]) => ({ key: `m:${id}`, label: name.toUpperCase(), id }));
}
/**
 * Kolom tambahan yang dinamis: posisi tim yang ada di template Ibadah Minggu, ditambah posisi mana pun yang sudah punya orang
 * terjadwal di tahun itu (mis. posisi baru yang ditambahkan manual ke satu acara), supaya tidak ada yang hilang dari template/export.
 */
async function scheduleExtras(tenantId: string, st: FormatState, year: number) {
  const base = templateExtras(st);
  const known = new Set([...[...st.ministries.values()].filter((m) => !!m).map((m) => m!.id), ...base.map((b) => b.id)]);
  const { from, to } = yearRange(year);
  const seats = await prisma.eventAssignment.findMany({
    where: {
      tenantId, teamTypeId: st.team.id, personId: { not: null }, ministryId: { notIn: [...known] },
      event: { deletedAt: null, status: { not: "CANCELLED" }, templateId: { in: [st.templates.get(1)!.id, st.templates.get(2)!.id] }, startsAt: { gte: from, lt: to } },
    },
    select: { ministry: { select: { id: true, name: true, sortOrder: true, deletedAt: true } } },
  });
  const byId = new Map(seats.filter((x) => !x.ministry.deletedAt).map((x) => [x.ministry.id, x.ministry] as const));
  const dyn = [...byId.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "id")).map((m) => ({ key: `m:${m.id}`, label: m.name.toUpperCase(), id: m.id }));
  return [...base, ...dyn];
}
const ministryIdOf = (st: FormatState, key: string) => (key.startsWith("m:") ? key.slice(2) : st.ministries.get(key)?.id);

/** Format dasar ditambah kolom pelayanan baru dari file (kunci x_…). */
export const withExtras = (f: TeamFormat, extras: ExtraSpec[]): TeamFormat => ({
  ...f,
  columns: [...f.columns, ...extras.filter((e) => !f.columns.some((c) => c.key === e.key)).map((e) => ({ key: e.key, label: e.ministry.toUpperCase(), ministry: e.ministry, aliases: [] as string[] }))],
});

const tplInclude = { slots: { include: { ministry: true } } } as const;

type Team = { id: string; name: string };

async function findTeam(tenantId: string, format: TeamFormat): Promise<Team> {
  const teams = await prisma.teamType.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const t = teams.find((x) => teamKind(x.name) === "EBM");
  if (!t) throw conflict(`Tim untuk jadwal ini (${format.teamName}) belum ada. Buat dulu di menu Tim.`);
  return t;
}

/** Hanya yang boleh mengatur kursi tim ini: butuh assignment.write dan tim miliknya (Admin Tim dibatasi ke timnya). */
function authorize(u: AuthUser, team: Team) {
  requirePermission(u, "assignment.write");
  requireTeamAccess(u, team.id);
}

type FormatState = {
  team: Team;
  ministries: Map<string, { id: string; name: string } | null>; // kunci kolom → posisi (null = belum ada)
  templates: Map<1 | 2, TplWithSlots>;
};

async function loadTemplates(tenantId: string): Promise<Map<1 | 2, TplWithSlots>> {
  const all = await prisma.eventTemplate.findMany({ where: { tenantId, deletedAt: null }, include: tplInclude });
  const out = new Map<1 | 2, TplWithSlots>();
  for (const t of all) {
    const p = sundayPair(t.name);
    if (p && !out.has(p.n)) out.set(p.n, t);
  }
  if (!out.has(1) || !out.has(2)) throw conflict('Template "Ibadah Minggu I" dan "Ibadah Minggu II" harus ada dulu (menu Template acara).');
  return out;
}

/** Baca keadaan saat ini tanpa mengubah apa pun. */
async function inspect(tenantId: string, format: TeamFormat): Promise<FormatState> {
  const team = await findTeam(tenantId, format);
  const ms = await prisma.ministry.findMany({ where: { tenantId, teamTypeId: team.id, deletedAt: null } });
  const ministries = new Map(format.columns.map((c) => [c.key, ms.find((m) => m.name.toLowerCase() === c.ministry.toLowerCase()) ?? null] as const));
  return { team, ministries, templates: await loadTemplates(tenantId) };
}

/**
 * Pastikan posisi mengikuti file ini: buat posisi yang belum ada dan samakan template Ibadah Minggu I/II.
 * Posisi lama (LCD, Sound, dst.) tidak dihapus karena template lain mungkin memakainya; hanya kursi di acara yang disentuh unggahan yang diganti.
 */
export async function ensureFormat(tenantId: string, format: TeamFormat): Promise<FormatState> {
  const team = await findTeam(tenantId, format);
  const existing = await prisma.ministry.findMany({ where: { tenantId, teamTypeId: team.id } });
  const ids = new Map<string, string>();
  for (const [i, c] of format.columns.entries()) {
    const found = existing.find((m) => m.name.toLowerCase() === c.ministry.toLowerCase());
    if (found) {
      if (found.deletedAt) await prisma.ministry.update({ where: { id: found.id }, data: { deletedAt: null } });
      ids.set(c.key, found.id);
    } else {
      const m = await prisma.ministry.create({ data: { tenantId, teamTypeId: team.id, name: c.ministry, sortOrder: 100 + i } });
      ids.set(c.key, m.id);
    }
  }
  const want = new Set(ids.values());
  const templates = await loadTemplates(tenantId);
  for (const t of templates.values()) {
    const ebmSlots = t.slots.filter((s) => s.ministry.teamTypeId === team.id);
    const drop = ebmSlots.filter((s) => !want.has(s.ministryId) || s.slotNo !== 1).map((s) => s.id);
    const have = new Set(ebmSlots.filter((s) => want.has(s.ministryId) && s.slotNo === 1).map((s) => s.ministryId));
    const add = [...want].filter((id) => !have.has(id));
    if (drop.length || add.length) {
      await prisma.$transaction([
        prisma.eventTemplateSlot.deleteMany({ where: { id: { in: drop } } }),
        prisma.eventTemplateSlot.createMany({ data: add.map((ministryId) => ({ templateId: t.id, ministryId, slotNo: 1, rehearsalRequired: false })) }),
      ]);
    }
  }
  const fresh = await loadTemplates(tenantId);
  const ms = await prisma.ministry.findMany({ where: { id: { in: [...want] } } });
  return { team, templates: fresh, ministries: new Map(format.columns.map((c) => [c.key, { id: ids.get(c.key)!, name: ms.find((m) => m.id === ids.get(c.key))?.name ?? c.ministry }] as const)) };
}

// ───────── pratinjau ─────────

export type PersonOpt = { id: string; name: string; nickname: string | null; isMember: boolean };
export type ExistingSeat = { ministryId: string; ministryName: string; slotNo: number; personId: string | null; personName: string | null };
export type ExistingService = { eventId: string; status: string; past: boolean; seats: ExistingSeat[] };

const yearRange = (year: number) => ({ from: zonedToUtc(`${year}-01-01`, "00:00"), to: zonedToUtc(`${year + 1}-01-01`, "00:00") });

/**
 * Orang yang boleh dipilih untuk jadwal tim, dengan penanda anggota tim: punya posisi di tim itu, atau masih anggota kelompok EBM
 * (orang yang sudah dimasukkan ke kelompok tetapi belum diberi posisi apa pun tetap muncul).
 */
async function candidates(tenantId: string, teamId: string): Promise<(Candidate & { personOpt: PersonOpt })[]> {
  const [rows, groups] = await Promise.all([
    prisma.person.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, nameKey: true, nickname: true, aliases: true, ministries: { select: { ministry: { select: { teamTypeId: true, deletedAt: true } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.meetingGroup.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true } }),
  ]);
  const gids = groups.filter((g) => EBM_GROUP.test(g.name.trim())).map((g) => g.id);
  const inGroup = new Set(
    gids.length ? (await prisma.groupMember.findMany({ where: { groupId: { in: gids }, leftAt: null }, select: { personId: true } })).map((m) => m.personId) : [],
  );
  return rows.map((p) => {
    const isMember = inGroup.has(p.id) || p.ministries.some((m) => m.ministry.teamTypeId === teamId && !m.ministry.deletedAt);
    return { id: p.id, name: p.name, nickname: p.nickname, aliases: p.aliases, nameKey: p.nameKey, isMember, personOpt: { id: p.id, name: p.name, nickname: p.nickname, isMember } };
  });
}

export async function previewSchedule(u: AuthUser, formatKey: string, year: number, sheets: XSheet[]) {
  const format = getFormat(formatKey);
  const st = await inspect(u.tenantId, format);
  authorize(u, st.team);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Tahun tidak valid.");

  const parsed = parseTeamSheet(sheets, format, year);
  const people = await candidates(u.tenantId, st.team.id);

  // tabel nama: satu baris per nama unik di file
  const names = new Map<string, { raw: string; count: number; dates: string[]; columns: Set<string> }>();
  for (const r of parsed.rows) {
    for (const c of [...format.columns, ...parsed.extraColumns]) {
      const raw = r.names[c.key];
      if (!raw) continue;
      const k = normName(raw);
      const cur = names.get(k) ?? { raw, count: 0, dates: [], columns: new Set<string>() };
      cur.count++;
      if (cur.dates.length < 3) cur.dates.push(r.date);
      cur.columns.add(c.label);
      names.set(k, cur);
    }
  }
  const nameRows = [...names.entries()]
    .map(([key, v]) => {
      const m = matchName(v.raw, people);
      return { key, raw: v.raw, count: v.count, columns: [...v.columns], status: m.status, personId: m.personId, guess: m.guess, suggestions: m.suggestions };
    })
    .sort((a, b) => (a.status === "MATCHED" ? 1 : 0) - (b.status === "MATCHED" ? 1 : 0) || a.raw.localeCompare(b.raw, "id"));

  // acara yang sudah ada
  const tplIds = [st.templates.get(1)!.id, st.templates.get(2)!.id];
  const { from, to } = yearRange(year);
  const events = await prisma.event.findMany({
    where: { tenantId: u.tenantId, deletedAt: null, templateId: { in: tplIds }, startsAt: { gte: from, lt: to } },
    select: {
      id: true, templateId: true, startsAt: true, endsAt: true, status: true,
      assignments: { where: { teamTypeId: st.team.id }, orderBy: [{ sortOrder: "asc" }], select: { ministryId: true, slotNo: true, personId: true, ministry: { select: { name: true } }, person: { select: { name: true } } } },
    },
  });
  const now = Date.now();
  const existing = new Map<string, { 1?: ExistingService; 2?: ExistingService }>();
  for (const e of events) {
    const n = e.templateId === tplIds[0] ? 1 : 2;
    const d = localParts(e.startsAt).date;
    const cur = existing.get(d) ?? {};
    cur[n] = {
      eventId: e.id, status: e.status, past: e.endsAt.getTime() < now,
      seats: e.assignments.map((a) => ({ ministryId: a.ministryId, ministryName: a.ministry.name, slotNo: a.slotNo, personId: a.personId, personName: a.person?.name ?? null })),
    };
    existing.set(d, cur);
  }

  const teamMinistries = await prisma.ministry.findMany({ where: { tenantId: u.tenantId, teamTypeId: st.team.id, deletedAt: null }, select: { id: true, name: true } });
  const extras = parsed.extraColumns.map((x) => {
    const have = teamMinistries.find((m) => m.name.toLowerCase() === x.suggested.toLowerCase());
    return { key: x.key, label: x.label, suggested: have?.name ?? x.suggested, exists: !!have, ministryId: have?.id ?? null };
  });

  return {
    year, sheetName: parsed.sheetName, extras, errors: parsed.errors, warnings: parsed.warnings,
    columns: format.columns.map((c) => ({ key: c.key, label: c.label, ministry: c.ministry, ministryId: st.ministries.get(c.key)?.id ?? null })),
    newMinistries: format.columns.filter((c) => !st.ministries.get(c.key)).map((c) => c.ministry),
    services: [1, 2].map((n) => ({ n, name: st.templates.get(n as 1 | 2)!.name, startTime: st.templates.get(n as 1 | 2)!.startTime })),
    rows: parsed.rows.map((r) => ({ date: r.date, month: r.month, line: r.line, names: r.names, existing: existing.get(r.date) ?? {} })),
    names: nameRows,
    people: people.map((p) => p.personOpt),
  };
}

// ───────── simpan per tanggal ─────────

export const applyBody = z.object({
  year: z.number().int().min(2000).max(2100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cells: z.record(z.string(), z.string().uuid().nullable()),
  extras: z.array(z.object({ key: z.string().regex(/^x_[A-Z0-9+]{1,40}$/), ministry: z.string().trim().min(1).max(60) })).max(8).default([]),
});
export const aliasBody = z.object({
  items: z.array(z.object({ personId: z.string().uuid(), raw: z.string().trim().min(1).max(60) })).max(300),
});

export type ServiceResult = {
  n: 1 | 2; name: string; state: "dibuat" | "diubah" | "sama" | "dilewati"; reason?: string; changed: number; rejected: { column: string; message: string }[];
};
export type DateResult = { date: string; services: ServiceResult[] };

export async function applyDate(u: AuthUser, formatKey: string, b: z.infer<typeof applyBody>): Promise<DateResult> {
  const format = withExtras(getFormat(formatKey), b.extras);
  if (new Set(format.columns.map((c) => c.ministry.toLowerCase())).size !== format.columns.length) throw badRequest("Nama pelayanan baru sama dengan pelayanan yang sudah ada di format.");
  const probe = await findTeam(u.tenantId, format);
  authorize(u, probe);

  const [y, m, d] = b.date.split("-").map(Number) as [number, number, number];
  if (y !== b.year) throw badRequest(`Tanggal ${b.date} di luar tahun ${b.year}.`);
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 0) throw badRequest(`${b.date} bukan hari Minggu.`);
  for (const k of Object.keys(b.cells)) if (!format.columns.some((c) => c.key === k)) throw badRequest(`Kolom "${k}" tidak dikenal.`);

  const st = await ensureFormat(u.tenantId, format);
  const keep = new Set([...st.ministries.values()].map((x) => x!.id));
  const wantedPeople = [...new Set(Object.values(b.cells).filter((x): x is string => !!x))];

  // orang yang diisi dicatat bisa di posisinya, supaya muncul di saran berikutnya
  const people = await prisma.person.findMany({ where: { id: { in: wantedPeople }, tenantId: u.tenantId, deletedAt: null }, select: { id: true } });
  if (people.length !== wantedPeople.length) throw badRequest("Ada orang yang tidak ditemukan. Muat ulang pratinjau.");
  const links = format.columns.flatMap((c) => (b.cells[c.key] ? [{ personId: b.cells[c.key]!, ministryId: st.ministries.get(c.key)!.id }] : []));
  if (links.length) {
    const before = await prisma.personMinistry.count({ where: { OR: links } });
    if (before < links.length) {
      await prisma.personMinistry.createMany({ data: links, skipDuplicates: true });
      await syncEbmGroup(prisma, u.tenantId, { only: wantedPeople, userId: u.userId });
    }
  }

  const results: ServiceResult[] = [];
  const touched: string[] = [];
  for (const n of [1, 2] as const) {
    const tpl = st.templates.get(n)!;
    const res: ServiceResult = { n, name: tpl.name, state: "sama", changed: 0, rejected: [] };
    results.push(res);

    const startsAt = zonedToUtc(b.date, tpl.startTime);
    if (addMinutes(startsAt, tpl.durationMin).getTime() < Date.now()) { res.state = "dilewati"; res.reason = "Tanggal sudah lewat."; continue; }

    let ev = await prisma.event.findFirst({ where: { tenantId: u.tenantId, templateId: tpl.id, startsAt, deletedAt: null }, select: { id: true, status: true } });
    let created = false;
    if (ev && !isEditable(ev.status)) { res.state = "dilewati"; res.reason = "Acara ini dibatalkan."; continue; }
    if (!ev) {
      const r = await createOnDate(u, tpl, b.date);
      if (!r.created) { res.state = "dilewati"; res.reason = r.skipped?.reason ?? "Acara tidak bisa dibuat."; continue; }
      ev = { id: r.created.id, status: "DRAFT" };
      created = true;
    }
    touched.push(ev.id);

    // samakan kursi tim: hanya satu kursi per posisi di file
    const seats = await prisma.eventAssignment.findMany({ where: { eventId: ev.id, teamTypeId: st.team.id }, orderBy: [{ slotNo: "asc" }, { sortOrder: "asc" }] });
    const seen = new Set<string>();
    const drop = seats.filter((s) => {
      if (!keep.has(s.ministryId) || seen.has(s.ministryId)) return true;
      seen.add(s.ministryId);
      return false;
    });
    if (drop.length) {
      await prisma.$transaction(async (tx) => {
        await releaseBookings(tx, { assignmentId: { in: drop.map((s) => s.id) } });
        await tx.eventAssignment.deleteMany({ where: { id: { in: drop.map((s) => s.id) } } });
        for (const pid of new Set(drop.map((s) => s.personId).filter((x): x is string => !!x))) await promoteOrphanOverrides(tx, u.tenantId, pid, ev!.id);
      });
      res.changed += drop.filter((s) => s.personId).length;
    }
    const hasKept = new Set(seats.filter((s) => !drop.includes(s)).map((s) => s.ministryId));
    const toAdd = format.columns.filter((c) => !hasKept.has(st.ministries.get(c.key)!.id));
    if (toAdd.length) {
      const order = await prisma.eventAssignment.aggregate({ where: { eventId: ev.id }, _max: { sortOrder: true } });
      let o = (order._max.sortOrder ?? -1) + 1;
      if (!(await prisma.eventTeam.count({ where: { eventId: ev.id, teamTypeId: st.team.id } }))) await prisma.eventTeam.create({ data: { eventId: ev.id, teamTypeId: st.team.id } });
      await prisma.eventAssignment.createMany({
        data: toAdd.map((c) => ({ tenantId: u.tenantId, eventId: ev!.id, teamTypeId: st.team.id, ministryId: st.ministries.get(c.key)!.id, slotNo: 1, sortOrder: o++, rehearsalRequired: false })),
      });
    }

    // isi: kosongkan dulu, baru isi, supaya perpindahan dalam satu acara tidak saling mengganjal
    const now = await prisma.eventAssignment.findMany({ where: { eventId: ev.id, teamTypeId: st.team.id, ministryId: { in: [...keep] } } });
    const byMinistry = new Map(now.map((s) => [s.ministryId, s]));
    const plan = format.columns.map((c) => ({ col: c, seat: byMinistry.get(st.ministries.get(c.key)!.id)!, want: b.cells[c.key] ?? null }));
    for (const pass of ["clear", "set"] as const) {
      for (const p of plan) {
        if (!p.seat || p.seat.personId === p.want) continue;
        if ((pass === "clear") !== (p.want === null)) continue;
        try {
          await assignCore(u, ev.id, p.seat.id, { personId: p.want }, { mirror: false });
          res.changed++;
        } catch (e) {
          if (e instanceof ApiError) res.rejected.push({ column: p.col.label, message: e.message });
          else throw e;
        }
      }
    }
    res.state = created ? "dibuat" : res.changed || drop.length || toAdd.length ? "diubah" : "sama";
  }

  if (touched.length) {
    await audit({ tenantId: u.tenantId, userId: u.userId, action: "assignment.upload", entity: "Event", entityId: touched[0]!, payload: { format: formatKey, date: b.date, events: touched, cells: b.cells } });
  }
  return { date: b.date, services: results };
}

/** Simpan ejaan nama di file sebagai alias, supaya unggahan berikutnya cocok otomatis. */
export async function saveAliases(u: AuthUser, formatKey: string, b: z.infer<typeof aliasBody>) {
  const format = getFormat(formatKey);
  authorize(u, await findTeam(u.tenantId, format));
  let saved = 0;
  for (const it of b.items) {
    const p = await prisma.person.findFirst({ where: { id: it.personId, tenantId: u.tenantId, deletedAt: null }, select: { id: true, name: true, nickname: true, aliases: true } });
    if (!p) continue;
    const a = normName(it.raw);
    if (!a || a === normName(p.name) || a === normName(p.nickname ?? "") || p.aliases.includes(a) || a === nameKey(p.name)) continue;
    await prisma.person.update({ where: { id: p.id }, data: { aliases: [...p.aliases, a].slice(-12) } });
    saved++;
  }
  return { saved };
}

// ───────── export ─────────

const displayName = (p: { name: string; nickname: string | null } | null) => (p ? p.nickname?.trim() || p.name : "");

export type ExportModel = {
  format: string; title: string; year: number;
  columns: { key: string; label: string }[];
  months: { month: number; name: string; rows: { date: string; day: number; cells: Record<string, string>; differs: boolean }[] }[];
  hasDiff: boolean;
};

export async function exportSchedule(u: AuthUser, formatKey: string, year: number, months: number[]): Promise<ExportModel> {
  const format = getFormat(formatKey);
  const st = await inspect(u.tenantId, format);
  authorize(u, st.team);
  const columns = [...format.columns.map((c) => ({ key: c.key, label: c.label })), ...(await scheduleExtras(u.tenantId, st, year)).map((x) => ({ key: x.key, label: x.label }))];
  const sel = [...new Set(months)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  if (!sel.length) throw badRequest("Pilih minimal satu bulan.");

  const tplIds = [st.templates.get(1)!.id, st.templates.get(2)!.id];
  const { from, to } = yearRange(year);
  const events = await prisma.event.findMany({
    where: { tenantId: u.tenantId, deletedAt: null, status: { not: "CANCELLED" }, templateId: { in: tplIds }, startsAt: { gte: from, lt: to } },
    select: { templateId: true, startsAt: true, assignments: { where: { teamTypeId: st.team.id }, select: { ministryId: true, slotNo: true, person: { select: { name: true, nickname: true } } } } },
  });
  const byDate = new Map<string, { 1?: Map<string, string>; 2?: Map<string, string> }>();
  for (const e of events) {
    const n = e.templateId === tplIds[0] ? 1 : 2;
    const d = localParts(e.startsAt).date;
    const cur = byDate.get(d) ?? {};
    cur[n] = new Map(e.assignments.filter((a) => a.slotNo === 1).map((a) => [a.ministryId, displayName(a.person)] as const));
    byDate.set(d, cur);
  }

  let hasDiff = false;
  const out: ExportModel["months"] = [];
  for (const month of sel) {
    const rows: ExportModel["months"][number]["rows"] = [];
    for (let day = 1; day <= 31; day++) {
      const dt = new Date(Date.UTC(year, month - 1, day));
      if (dt.getUTCMonth() !== month - 1) break;
      if (dt.getUTCDay() !== 0) continue;
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const src = byDate.get(date) ?? {};
      const cells: Record<string, string> = {};
      let differs = false;
      for (const c of columns) {
        const mid = ministryIdOf(st, c.key);
        const a = (mid && src[1]?.get(mid)) || "";
        const b2 = (mid && src[2]?.get(mid)) || "";
        if (a && b2 && a !== b2) { cells[c.key] = `${a} / ${b2}`; differs = true; }
        else cells[c.key] = a || b2;
      }
      if (differs) hasDiff = true;
      rows.push({ date, day, cells, differs });
    }
    out.push({ month, name: MONTHS_ID[month - 1]!.toUpperCase(), rows });
  }
  return { format: formatKey, title: format.title, year, columns, months: out, hasDiff };
}

// ───────── template Excel ─────────

/** `filled`: isi kolom dengan petugas yang sudah dijadwalkan di tahun itu (Ibadah I; bila berbeda dengan Ibadah II, tetap yang I). */
export async function templateWorkbook(u: AuthUser, formatKey: string, year: number, filled = false): Promise<Buffer> {
  const format = getFormat(formatKey);
  const team = await findTeam(u.tenantId, format);
  authorize(u, team);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Tahun tidak valid.");

  const members = (await candidates(u.tenantId, team.id)).filter((p) => p.isMember).map((p) => displayName({ name: p.name, nickname: p.nickname }));
  const current = new Map<string, Record<string, string>>(); // tanggal → kolom → nama
  let anyDiff = false;
  if (filled) {
    const model = await exportSchedule(u, formatKey, year, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    anyDiff = model.hasDiff;
    for (const mo of model.months) for (const r of mo.rows) current.set(r.date, Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [k, v.split(" / ")[0]!])));
  }
  // daftar pilihan: anggota tim, ditambah siapa pun yang sudah tertulis di jadwal (supaya tidak ditandai salah ketik)
  const list = [...new Set([...members, ...[...current.values()].flatMap((m) => Object.values(m)).filter(Boolean)])].sort((a, b) => a.localeCompare(b, "id"));
  const cells: XCell[] = [];
  const merges: string[] = [];
  const lists: { sqref: string; formula: string }[] = [];
  const st = await inspect(u.tenantId, format);
  const cols = [...format.columns.map((c) => ({ key: c.key, label: c.label })), ...(await scheduleExtras(u.tenantId, st, year)).map((x) => ({ key: x.key, label: x.label }))];
  const nc = cols.length;
  let r = 3;
  cells.push({ r: 1, c: 3, v: `${format.title} ${year}`, s: "bold" });
  cells.push({ r: 2, c: 3, v: `Isi nama persis seperti di daftar pilihan (atau nama panggilan). Satu baris berlaku untuk Ibadah Minggu I dan II. Satu kursi satu nama.${filled ? " Terisi dari jadwal yang sudah ada." : ""}${anyDiff ? " Bila Ibadah I dan II berbeda, yang tertulis adalah petugas Ibadah I." : ""}`, s: "note" });
  for (let month = 1; month <= 12; month++) {
    cells.push({ r, c: 3, v: MONTHS_ID[month - 1]!.toUpperCase(), s: "title" });
    for (let c = 4; c < 3 + nc + 1; c++) cells.push({ r, c, v: "", s: "title" });
    merges.push(`C${r}:${String.fromCharCode(66 + nc + 1)}${r}`);
    r++;
    cells.push({ r, c: 3, v: "TGL", s: "head" });
    cols.forEach((c, i) => cells.push({ r, c: 4 + i, v: c.label, s: "head" }));
    r++;
    const first = r;
    for (let day = 1; day <= 31; day++) {
      const dt = new Date(Date.UTC(year, month - 1, day));
      if (dt.getUTCMonth() !== month - 1) break;
      if (dt.getUTCDay() !== 0) continue;
      cells.push({ r, c: 3, v: day, s: "center" });
      const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const have = current.get(date);
      for (let i = 0; i < nc; i++) cells.push({ r, c: 4 + i, v: (have && have[cols[i]!.key]) || "", s: "cell" });
      r++;
    }
    if (list.length && r > first) lists.push({ sqref: `D${first}:${String.fromCharCode(67 + nc)}${r - 1}`, formula: `Daftar!$A$1:$A$${list.length}` });
    r += 2;
  }
  const main = { name: `Jadwal ${format.key.toUpperCase()} ${year}`, cols: [3, 3, 8, ...cols.map((c) => Math.max(14, c.label.length + 3))], cells, merges, lists };
  const sheets = [main];
  if (list.length) sheets.push({ name: "Daftar", cols: [30], cells: list.map((v, i) => ({ r: i + 1, c: 1, v })), merges: [], lists: [] });
  return buildXlsx(sheets);
}

// izin tampilan tombol (dipakai halaman)
export const canUploadSchedule = (u: AuthUser) => can(u, "assignment.write");

/** Export ke Excel: satu blok per bulan, tata letak sama dengan template supaya bisa diunggah ulang. */
export function exportWorkbook(m: ExportModel): Buffer {
  const nc = m.columns.length;
  const cells: XCell[] = [];
  const merges: string[] = [];
  let r = 1;
  cells.push({ r, c: 3, v: `${m.title} ${m.year}`, s: "bold" });
  r = 3;
  for (const mo of m.months) {
    cells.push({ r, c: 3, v: mo.name, s: "title" });
    for (let c = 4; c <= 3 + nc; c++) cells.push({ r, c, v: "", s: "title" });
    merges.push(`C${r}:${String.fromCharCode(67 + nc)}${r}`);
    r++;
    cells.push({ r, c: 3, v: "TGL", s: "head" });
    m.columns.forEach((c, i) => cells.push({ r, c: 4 + i, v: c.label, s: "head" }));
    r++;
    for (const row of mo.rows) {
      cells.push({ r, c: 3, v: row.day, s: "center" });
      m.columns.forEach((c, i) => cells.push({ r, c: 4 + i, v: row.cells[c.key] ?? "", s: "cell" }));
      r++;
    }
    r += 2;
  }
  if (m.hasDiff) cells.push({ r, c: 3, v: 'Tanda "A / B": petugas Ibadah Minggu I dan II berbeda (I / II).', s: "note" });
  return buildXlsx([{ name: `Jadwal ${m.year}`, cols: [3, 3, 8, ...m.columns.map((c) => Math.max(14, c.label.length + 3))], cells, merges }]);
}
