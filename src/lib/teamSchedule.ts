/**
 * Jadwal tahunan per tim: siapkan posisi, pratinjau file, simpan per tanggal, export, dan template.
 * Format EBM: satu baris tanggal berlaku untuk dua ibadah (Ibadah Minggu I dan II).
 * Format Usher: kolom dikelompokkan per ibadah (KU1 = Ibadah Minggu I, KU2 = Ibadah Minggu II), tiap kelompok beberapa kursi.
 * Format Penatalayan: satu baris untuk kedua ibadah seperti EBM, kolom dinamis (Gitar 2, alat baru), ditambah Band/No Band, Padus, dan Tema.
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
import { FORMATS, MAX_SLOTS, MONTHS_ID, headerRow, matchName, normName, parseTeamSheet, withSlots, type Candidate, type RowAttrs, type TeamFormat } from "./teamFormats";
import { PENATALAYAN_FORMAT, PEN_BASES, PEN_DEFAULT_COUNTS, PEN_ATTR, PEN_PADUS_MAX, PEN_THEME_MAX, isPenText, parsePenSheet, penLayout, penSheet, sanitizePenCounts, withPenSlots } from "./penatalayan";
import type { XSheet } from "./importer/xlsx";
import { buildXlsx, colLetter, type XCell } from "./xlsxWrite";

const ALL_FORMATS: Record<string, TeamFormat> = { ...FORMATS, [PENATALAYAN_FORMAT.key]: PENATALAYAN_FORMAT };

export const getFormat = (key: string): TeamFormat => {
  const f = ALL_FORMATS[key];
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
  const t = teams.find((x) => teamKind(x.name) === format.teamKind);
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
  ministries: Map<string, { id: string; name: string; bandOnly?: boolean } | null>; // kunci kolom → posisi (null = belum ada)
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
  const byName = new Map<string, string>(); // beberapa kolom bisa memakai posisi yang sama (Usher 1, 2, 3 …)
  for (const [i, c] of format.columns.entries()) {
    const nm = c.ministry.toLowerCase();
    const done = byName.get(nm);
    if (done) { ids.set(c.key, done); continue; }
    const found = existing.find((m) => m.name.toLowerCase() === nm);
    if (found) {
      if (found.deletedAt) await prisma.ministry.update({ where: { id: found.id }, data: { deletedAt: null } });
      ids.set(c.key, found.id);
      byName.set(nm, found.id);
    } else {
      const m = await prisma.ministry.create({ data: { tenantId, teamTypeId: team.id, name: c.ministry, sortOrder: 100 + i, bandOnly: !!c.bandOnly } });
      ids.set(c.key, m.id);
      byName.set(nm, m.id);
    }
  }
  const want = new Set(ids.values());
  const templates = await loadTemplates(tenantId);
  for (const [n, t] of templates) {
    // kursi yang harus ada di template ini: posisi + nomor kursi, hanya untuk kolom milik ibadah ini
    const wantSeats = new Map<string, { ministryId: string; slotNo: number }>();
    for (const c of format.columns) {
      if (c.service !== undefined && c.service !== n) continue;
      const ministryId = ids.get(c.key)!;
      wantSeats.set(`${ministryId}:${c.slotNo ?? 1}`, { ministryId, slotNo: c.slotNo ?? 1 });
    }
    const teamSlots = t.slots.filter((s) => s.ministry.teamTypeId === team.id);
    const have = new Set(teamSlots.map((s) => `${s.ministryId}:${s.slotNo}`));
    const keepNames = new Set((format.preserve ?? []).map((x) => x.toLowerCase())); // mis. Pembicara: bukan bagian file, tidak dihapus dari template
    const drop = teamSlots.filter((s) => !wantSeats.has(`${s.ministryId}:${s.slotNo}`) && !keepNames.has(s.ministry.name.toLowerCase())).map((s) => s.id);
    const add = [...wantSeats.entries()].filter(([k]) => !have.has(k)).map(([, v]) => v);
    if (drop.length || add.length) {
      await prisma.$transaction([
        prisma.eventTemplateSlot.deleteMany({ where: { id: { in: drop } } }),
        prisma.eventTemplateSlot.createMany({ data: add.map((x) => ({ templateId: t.id, ministryId: x.ministryId, slotNo: x.slotNo, rehearsalRequired: false })) }),
      ]);
    }
  }
  const fresh = await loadTemplates(tenantId);
  const ms = await prisma.ministry.findMany({ where: { id: { in: [...want] } } });
  return { team, templates: fresh, ministries: new Map(format.columns.map((c) => [c.key, { id: ids.get(c.key)!, name: ms.find((m) => m.id === ids.get(c.key))?.name ?? c.ministry, bandOnly: ms.find((m) => m.id === ids.get(c.key))?.bandOnly }] as const)) };
}

// ───────── pratinjau ─────────

export type PersonOpt = { id: string; name: string; nickname: string | null; isMember: boolean };
export type ExistingSeat = { ministryId: string; ministryName: string; slotNo: number; personId: string | null; personName: string | null };
export type ExistingService = { eventId: string; status: string; past: boolean; seats: ExistingSeat[]; bandMode: string; theme: string | null; padus: string | null };

const yearRange = (year: number) => ({ from: zonedToUtc(`${year}-01-01`, "00:00"), to: zonedToUtc(`${year + 1}-01-01`, "00:00") });

/**
 * Orang yang boleh dipilih untuk jadwal tim, dengan penanda anggota tim: punya posisi di tim itu, atau (khusus EBM) masih anggota kelompok EBM
 * (orang yang sudah dimasukkan ke kelompok tetapi belum diberi posisi apa pun tetap muncul).
 */
async function candidates(tenantId: string, teamId: string, useEbmGroup: boolean): Promise<(Candidate & { personOpt: PersonOpt })[]> {
  const [rows, groups] = await Promise.all([
    prisma.person.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, nameKey: true, nickname: true, aliases: true, ministries: { select: { ministry: { select: { teamTypeId: true, deletedAt: true } } } } },
      orderBy: { name: "asc" },
    }),
    prisma.meetingGroup.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true } }),
  ]);
  const gids = useEbmGroup ? groups.filter((g) => EBM_GROUP.test(g.name.trim())).map((g) => g.id) : [];
  const inGroup = new Set(
    gids.length ? (await prisma.groupMember.findMany({ where: { groupId: { in: gids }, leftAt: null }, select: { personId: true } })).map((m) => m.personId) : [],
  );
  return rows.map((p) => {
    const isMember = inGroup.has(p.id) || p.ministries.some((m) => m.ministry.teamTypeId === teamId && !m.ministry.deletedAt);
    return { id: p.id, name: p.name, nickname: p.nickname, aliases: p.aliases, nameKey: p.nameKey, isMember, personOpt: { id: p.id, name: p.name, nickname: p.nickname, isMember } };
  });
}

export async function previewSchedule(u: AuthUser, formatKey: string, year: number, sheets: XSheet[]) {
  const base = getFormat(formatKey);
  authorize(u, await findTeam(u.tenantId, base));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Tahun tidak valid.");

  const parsed = base.pen ? parsePenSheet(sheets, base, year) : parseTeamSheet(sheets, base, year);
  const penSlots = base.pen ? sanitizePenCounts(parsed.penSlots) : null;
  const format = base.pen ? withPenSlots(base, penSlots!) : parsed.slotCounts ? withSlots(base, parsed.slotCounts) : base; // jumlah kursi mengikuti file
  const st = await inspect(u.tenantId, format);
  const people = await candidates(u.tenantId, st.team.id, format.teamKind === "EBM");

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
      id: true, templateId: true, startsAt: true, endsAt: true, status: true, bandMode: true, theme: true, padus: true,
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
      eventId: e.id, status: e.status, past: e.endsAt.getTime() < now, bandMode: e.bandMode, theme: e.theme, padus: e.padus,
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
    teamShort: format.teamShort, perService: !!format.groups, slots: parsed.slotCounts, pen: !!format.pen, penSlots,
    columns: format.columns.map((c) => ({ key: c.key, label: c.label, ministry: c.ministry, ministryId: st.ministries.get(c.key)?.id ?? null, service: c.service ?? null, slotNo: c.slotNo ?? 1, bandOnly: !!(st.ministries.get(c.key)?.bandOnly ?? c.bandOnly) })),
    groups: format.groups ? format.groups.map((g) => ({ service: g.service, label: g.label, keys: format.columns.filter((c) => c.service === g.service).map((c) => c.key) })) : null,
    newMinistries: [...new Set(format.columns.filter((c) => !st.ministries.get(c.key)).map((c) => c.ministry))],
    services: [1, 2].map((n) => ({ n, name: st.templates.get(n as 1 | 2)!.name, startTime: st.templates.get(n as 1 | 2)!.startTime })),
    rows: parsed.rows.map((r) => ({ date: r.date, month: r.month, line: r.line, names: r.names, attrs: r.attrs ?? null, existing: existing.get(r.date) ?? {} })),
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
  slots: z.tuple([z.number().int().min(1).max(MAX_SLOTS), z.number().int().min(1).max(MAX_SLOTS)]).optional(), // jumlah kursi KU1 dan KU2 (format per ibadah)
  penSlots: z.record(z.string(), z.number().int().min(0).max(MAX_SLOTS)).optional(), // format Penatalayan: jumlah kursi tiap posisi dasar
  // atribut acara (format Penatalayan). Yang tidak dikirim tidak diubah; band null = tidak disebut di file
  attrs: z.object({ band: z.enum(["BAND", "NO_BAND"]).nullable().optional(), padus: z.string().max(PEN_PADUS_MAX).optional(), theme: z.string().max(PEN_THEME_MAX).optional() }).optional(),
});
export const aliasBody = z.object({
  items: z.array(z.object({ personId: z.string().uuid(), raw: z.string().trim().min(1).max(60) })).max(300),
});

export type ServiceResult = {
  n: 1 | 2; name: string; state: "dibuat" | "diubah" | "sama" | "dilewati"; reason?: string; changed: number; rejected: { column: string; message: string }[];
};
export type DateResult = { date: string; services: ServiceResult[] };

export async function applyDate(u: AuthUser, formatKey: string, b: z.infer<typeof applyBody>): Promise<DateResult> {
  const raw = getFormat(formatKey);
  const base = withExtras(raw.pen ? withPenSlots(raw, sanitizePenCounts(b.penSlots ?? PEN_DEFAULT_COUNTS)) : raw, b.extras);
  const format = !raw.pen && b.slots ? withSlots(base, b.slots) : base;
  const slotKey = (c: { ministry: string; service?: 1 | 2; slotNo?: number }) => `${c.ministry.toLowerCase()}|${c.service ?? 0}|${c.slotNo ?? 1}`;
  if (new Set(format.columns.map(slotKey)).size !== format.columns.length) throw badRequest("Nama pelayanan baru sama dengan pelayanan yang sudah ada di format.");
  const probe = await findTeam(u.tenantId, format);
  authorize(u, probe);

  const [y, m, d] = b.date.split("-").map(Number) as [number, number, number];
  if (y !== b.year) throw badRequest(`Tanggal ${b.date} di luar tahun ${b.year}.`);
  if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 0) throw badRequest(`${b.date} bukan hari Minggu.`);
  for (const k of Object.keys(b.cells)) if (!format.columns.some((c) => c.key === k)) throw badRequest(`Kolom "${k}" tidak dikenal.`);

  const st = await ensureFormat(u.tenantId, format);
  const keep = new Set([...st.ministries.values()].map((x) => x!.id));
  const wantedPeople = [...new Set(Object.values(b.cells).filter((x): x is string => !!x))];
  const bandOnlyIds = new Set([...st.ministries.values()].filter((x) => x?.bandOnly).map((x) => x!.id));
  const preserved = new Set(
    format.preserve?.length
      ? (await prisma.ministry.findMany({ where: { tenantId: u.tenantId, teamTypeId: st.team.id, deletedAt: null }, select: { id: true, name: true } })).filter((x) => format.preserve!.some((n) => n.toLowerCase() === x.name.toLowerCase())).map((x) => x.id)
      : [],
  );
  const attrs: RowAttrs | undefined = b.attrs;
  const hasBandNames = format.columns.some((c) => bandOnlyIds.has(st.ministries.get(c.key)!.id) && !!b.cells[c.key]);
  const wantBand: "BAND" | "NO_BAND" | null = attrs?.band ?? (attrs && hasBandNames ? "BAND" : null);

  // orang yang diisi dicatat bisa di posisinya, supaya muncul di saran berikutnya
  const people = await prisma.person.findMany({ where: { id: { in: wantedPeople }, tenantId: u.tenantId, deletedAt: null }, select: { id: true } });
  if (people.length !== wantedPeople.length) throw badRequest("Ada orang yang tidak ditemukan. Muat ulang pratinjau.");
  const links = [...new Map(format.columns.flatMap((c) => (b.cells[c.key] ? [{ personId: b.cells[c.key]!, ministryId: st.ministries.get(c.key)!.id }] : [])).map((l) => [`${l.personId}|${l.ministryId}`, l] as const)).values()];
  if (links.length) {
    const before = await prisma.personMinistry.count({ where: { OR: links } });
    if (before < links.length) {
      await prisma.personMinistry.createMany({ data: links, skipDuplicates: true });
      if (format.teamKind === "EBM") await syncEbmGroup(prisma, u.tenantId, { only: wantedPeople, userId: u.userId });
    }
  }

  const results: ServiceResult[] = [];
  const touched: string[] = [];
  for (const n of [1, 2] as const) {
    const tpl = st.templates.get(n)!;
    const res: ServiceResult = { n, name: tpl.name, state: "sama", changed: 0, rejected: [] };
    results.push(res);

    // kolom milik ibadah ini (format bersama: semua kolom; format per ibadah: hanya kelompoknya)
    let svcCols = format.columns.filter((c) => c.service === undefined || c.service === n);
    const seatKey = (ministryId: string, slotNo: number) => `${ministryId}:${slotNo}`;
    const colKey = (c: (typeof svcCols)[number]) => seatKey(st.ministries.get(c.key)!.id, c.slotNo ?? 1);
    let wanted = new Set(svcCols.map(colKey));

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

    // atribut acara: Band/No Band, Tema, Padus (hanya yang ada di file). Band dipulihkan sebelum kursi diisi; No Band membuang kursi band di bawah.
    let attrChanged = false;
    if (raw.pen) {
      const cur = await prisma.event.findUnique({ where: { id: ev.id }, select: { bandMode: true, theme: true, padus: true } });
      const patch: { bandMode?: string; theme?: string | null; padus?: string | null } = {};
      if (wantBand && cur?.bandMode !== wantBand) patch.bandMode = wantBand;
      if (attrs?.theme !== undefined && (attrs.theme.trim() || null) !== (cur?.theme ?? null)) patch.theme = attrs.theme.trim() || null;
      if (attrs?.padus !== undefined && (attrs.padus.trim() || null) !== (cur?.padus ?? null)) patch.padus = attrs.padus.trim() || null;
      if (Object.keys(patch).length) { await prisma.event.update({ where: { id: ev.id }, data: patch }); attrChanged = true; }
      if ((wantBand ?? cur?.bandMode) === "NO_BAND") {
        svcCols = svcCols.filter((c) => !bandOnlyIds.has(st.ministries.get(c.key)!.id));
        wanted = new Set(svcCols.map(colKey));
      }
    }

    // samakan kursi tim: hanya kursi yang ada di file (satu per posisi dan nomor kursi)
    const seats = await prisma.eventAssignment.findMany({ where: { eventId: ev.id, teamTypeId: st.team.id }, orderBy: [{ slotNo: "asc" }, { sortOrder: "asc" }] });
    const seen = new Set<string>();
    const drop = seats.filter((s) => {
      if (preserved.has(s.ministryId)) return false;
      const k = seatKey(s.ministryId, s.slotNo);
      if (!wanted.has(k) || seen.has(k)) return true;
      seen.add(k);
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
    const hasKept = new Set(seats.filter((s) => !drop.includes(s)).map((s) => seatKey(s.ministryId, s.slotNo)));
    const toAdd = svcCols.filter((c) => !hasKept.has(colKey(c)));
    if (toAdd.length) {
      const order = await prisma.eventAssignment.aggregate({ where: { eventId: ev.id }, _max: { sortOrder: true } });
      let o = (order._max.sortOrder ?? -1) + 1;
      if (!(await prisma.eventTeam.count({ where: { eventId: ev.id, teamTypeId: st.team.id } }))) await prisma.eventTeam.create({ data: { eventId: ev.id, teamTypeId: st.team.id } });
      await prisma.eventAssignment.createMany({
        data: toAdd.map((c) => ({ tenantId: u.tenantId, eventId: ev!.id, teamTypeId: st.team.id, ministryId: st.ministries.get(c.key)!.id, slotNo: c.slotNo ?? 1, sortOrder: o++, rehearsalRequired: false })),
      });
    }

    // isi: kosongkan dulu, baru isi, supaya perpindahan dalam satu acara tidak saling mengganjal
    const now = await prisma.eventAssignment.findMany({ where: { eventId: ev.id, teamTypeId: st.team.id, ministryId: { in: [...keep] } } });
    const bySeat = new Map(now.map((s) => [seatKey(s.ministryId, s.slotNo), s]));
    const plan = svcCols.map((c) => ({ col: c, seat: bySeat.get(colKey(c))!, want: b.cells[c.key] ?? null }));
    for (const pass of ["clear", "set"] as const) {
      for (const p of plan) {
        if (!p.seat || p.seat.personId === p.want) continue;
        if ((pass === "clear") !== (p.want === null)) continue;
        try {
          await assignCore(u, ev.id, p.seat.id, { personId: p.want }, { mirror: false, notify: false });
          res.changed++;
        } catch (e) {
          if (e instanceof ApiError) res.rejected.push({ column: p.col.label, message: e.message });
          else throw e;
        }
      }
    }
    res.state = created ? "dibuat" : res.changed || drop.length || toAdd.length || attrChanged ? "diubah" : "sama";
  }

  if (touched.length) {
    await audit({ tenantId: u.tenantId, userId: u.userId, action: "assignment.upload", entity: "Event", entityId: touched[0]!, payload: { format: formatKey, date: b.date, events: touched, cells: b.cells, ...(attrs ? { attrs } : {}) } });
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
  format: string; title: string; year: number; teamShort: string;
  columns: { key: string; label: string }[];
  groups: { label: string; keys: string[]; single?: boolean }[] | null; // judul kelompok kolom (KU1, KU2; Penatalayan: Liturgos, Pemusik, …)
  pen?: boolean; // Penatalayan: header dua baris, kolom Band/No Band, Padus, Tema
  months: { month: number; name: string; rows: { date: string; day: number; cells: Record<string, string>; differs: boolean }[] }[];
  hasDiff: boolean;
};

/** Jumlah kursi KU1 dan KU2 untuk export/template: paling sedikit jumlah bawaan, lalu mengikuti template dan kursi yang sudah terisi di tahun itu. */
async function slotCountsFor(tenantId: string, st: FormatState, format: TeamFormat, year: number): Promise<[number, number]> {
  const out: [number, number] = [format.groups![0]!.slots, format.groups![1]!.slots];
  const { from, to } = yearRange(year);
  for (const n of [1, 2] as const) {
    const tpl = st.templates.get(n)!;
    const inTemplate = Math.max(0, ...tpl.slots.filter((x) => x.ministry.teamTypeId === st.team.id).map((x) => x.slotNo));
    const agg = await prisma.eventAssignment.aggregate({
      _max: { slotNo: true },
      where: { tenantId, teamTypeId: st.team.id, personId: { not: null }, event: { deletedAt: null, status: { not: "CANCELLED" }, templateId: tpl.id, startsAt: { gte: from, lt: to } } },
    });
    out[n - 1] = Math.min(MAX_SLOTS, Math.max(out[n - 1]!, inTemplate, agg._max.slotNo ?? 0));
  }
  return out;
}

/** Format beserta keadaannya; untuk format per ibadah jumlah kolomnya disesuaikan dengan jumlah kursi tahun itu. */
/** Jumlah kursi tiap posisi Penatalayan untuk export/template: mengikuti template Ibadah Minggu dan kursi terisi tahun itu; kosong semua → bawaan. */
async function penCountsFor(tenantId: string, st: FormatState, year: number): Promise<Record<string, number>> {
  const { from, to } = yearRange(year);
  const tplIds = [st.templates.get(1)!.id, st.templates.get(2)!.id];
  const agg = await prisma.eventAssignment.groupBy({
    by: ["ministryId"], _max: { slotNo: true },
    where: { tenantId, teamTypeId: st.team.id, personId: { not: null }, event: { deletedAt: null, status: { not: "CANCELLED" }, templateId: { in: tplIds }, startsAt: { gte: from, lt: to } } },
  });
  const used = new Map(agg.map((a) => [a.ministryId, a._max.slotNo ?? 0] as const));
  const counts: Record<string, number> = {};
  for (const b of PEN_BASES) {
    const mid = st.ministries.get(b.key)?.id;
    if (!mid) continue;
    const inTpl = Math.max(0, ...[...st.templates.values()].flatMap((t) => t.slots.filter((x) => x.ministryId === mid).map((x) => x.slotNo)));
    const n = Math.min(MAX_SLOTS, Math.max(inTpl, used.get(mid) ?? 0));
    if (n > 0) counts[b.key] = n;
  }
  return Object.keys(counts).length ? counts : { ...PEN_DEFAULT_COUNTS };
}

async function formatFor(tenantId: string, formatKey: string, year: number) {
  const base = getFormat(formatKey);
  const st0 = await inspect(tenantId, base);
  if (base.pen) {
    const format = withPenSlots(base, await penCountsFor(tenantId, st0, year));
    return { format, st: await inspect(tenantId, format) };
  }
  if (!base.groups) return { format: base, st: st0 };
  const format = withSlots(base, await slotCountsFor(tenantId, st0, base, year));
  return { format, st: await inspect(tenantId, format) };
}

const groupsOf = (format: TeamFormat) => (format.groups ? format.groups.map((g) => ({ label: g.label, keys: format.columns.filter((c) => c.service === g.service).map((c) => c.key) })) : null);

export async function exportSchedule(u: AuthUser, formatKey: string, year: number, months: number[]): Promise<ExportModel> {
  const { format, st } = await formatFor(u.tenantId, formatKey, year);
  authorize(u, st.team);
  const extra = format.groups ? [] : await penAwareExtras(u.tenantId, st, format, year);
  const seatCols = [...format.columns.map((c) => ({ key: c.key, label: c.label })), ...extra.map((x) => ({ key: x.key, label: x.label }))];
  const lay = format.pen ? penLayout(format.columns, extra.map((x) => ({ key: x.key, label: x.label }))) : null;
  const columns = lay ? lay.columns : seatCols;
  const sel = [...new Set(months)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  if (!sel.length) throw badRequest("Pilih minimal satu bulan.");

  const tplIds = [st.templates.get(1)!.id, st.templates.get(2)!.id];
  const { from, to } = yearRange(year);
  const events = await prisma.event.findMany({
    where: { tenantId: u.tenantId, deletedAt: null, status: { not: "CANCELLED" }, templateId: { in: tplIds }, startsAt: { gte: from, lt: to } },
    select: { templateId: true, startsAt: true, bandMode: true, theme: true, padus: true, assignments: { where: { teamTypeId: st.team.id }, select: { ministryId: true, slotNo: true, person: { select: { name: true, nickname: true } } } } },
  });
  const evAttrs = new Map<string, { 1?: { band: string; theme: string; padus: string }; 2?: { band: string; theme: string; padus: string } }>();
  // tanggal → ibadah → "posisi:nomor kursi" → nama
  const byDate = new Map<string, { 1?: Map<string, string>; 2?: Map<string, string> }>();
  for (const e of events) {
    const n = e.templateId === tplIds[0] ? 1 : 2;
    const d = localParts(e.startsAt).date;
    const cur = byDate.get(d) ?? {};
    cur[n] = new Map(e.assignments.map((a) => [`${a.ministryId}:${a.slotNo}`, displayName(a.person)] as const));
    byDate.set(d, cur);
    const at = evAttrs.get(d) ?? {};
    at[n] = { band: e.bandMode, theme: e.theme ?? "", padus: e.padus ?? "" };
    evAttrs.set(d, at);
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
        if (format.pen && c.key.startsWith("@")) { // atribut acara: Band/No Band, Padus, Tema (Ibadah I, bila kosong Ibadah II)
          const at = evAttrs.get(date) ?? {};
          const a1 = at[1], a2 = at[2];
          if (c.key === PEN_ATTR.band) cells[c.key] = !a1 && !a2 ? "" : (a1?.band ?? a2!.band) === "NO_BAND" ? "No Band" : "Band";
          else if (c.key === PEN_ATTR.padus) cells[c.key] = a1?.padus || a2?.padus || "";
          else cells[c.key] = a1?.theme || a2?.theme || "";
          continue;
        }
        const mid = ministryIdOf(st, c.key);
        const fc = format.columns.find((x) => x.key === c.key);
        const slot = fc?.slotNo ?? 1;
        if (fc?.service) { // format per ibadah: tiap kolom milik satu ibadah dan satu nomor kursi
          cells[c.key] = (mid && src[fc.service]?.get(`${mid}:${fc.slotNo ?? 1}`)) || "";
          continue;
        }
        const a = (mid && src[1]?.get(`${mid}:${slot}`)) || "";
        const b2 = (mid && src[2]?.get(`${mid}:${slot}`)) || "";
        if (a && b2 && a !== b2) { cells[c.key] = `${a} / ${b2}`; differs = true; }
        else cells[c.key] = a || b2;
      }
      if (differs) hasDiff = true;
      rows.push({ date, day, cells, differs });
    }
    out.push({ month, name: MONTHS_ID[month - 1]!.toUpperCase(), rows });
  }
  return { format: formatKey, title: format.title, year, teamShort: format.teamShort, columns, groups: lay ? lay.groups : groupsOf(format), months: out, hasDiff, ...(format.pen ? { pen: true } : {}) };
}

/** Kolom tambahan; untuk Penatalayan posisi yang dipertahankan di luar file (Pembicara) tidak ikut jadi kolom. */
async function penAwareExtras(tenantId: string, st: FormatState, format: TeamFormat, year: number) {
  const all = await scheduleExtras(tenantId, st, year);
  if (!format.pen) return all;
  const skip = new Set((format.preserve ?? []).map((x) => x.toLowerCase()));
  return all.filter((x) => !skip.has(x.label.toLowerCase()));
}

// ───────── template Excel ─────────

/** `filled`: isi kolom dengan petugas yang sudah dijadwalkan di tahun itu (format bersama: Ibadah I; bila berbeda dengan Ibadah II, tetap yang I). */
export async function templateWorkbook(u: AuthUser, formatKey: string, year: number, filled = false): Promise<Buffer> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Tahun tidak valid.");
  const { format, st } = await formatFor(u.tenantId, formatKey, year);
  authorize(u, st.team);

  const members = (await candidates(u.tenantId, st.team.id, format.teamKind === "EBM")).filter((p) => p.isMember).map((p) => displayName({ name: p.name, nickname: p.nickname }));
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
  const extra = format.groups ? [] : await penAwareExtras(u.tenantId, st, format, year);
  if (format.pen) {
    const lay = penLayout(format.columns, extra.map((x) => ({ key: x.key, label: x.label })));
    const months = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const rows: { day: number; cells: Record<string, string> }[] = [];
      for (let day = 1; day <= 31; day++) {
        const dt = new Date(Date.UTC(year, month - 1, day));
        if (dt.getUTCMonth() !== month - 1) break;
        if (dt.getUTCDay() !== 0) continue;
        rows.push({ day, cells: current.get(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`) ?? {} });
      }
      return { name: MONTHS_ID[i]!.toUpperCase(), rows };
    });
    // validasi pilihan hanya untuk kolom nama; Band/No Band punya pilihan sendiri
    const lists: { sqref: string; formula: string }[] = [];
    lay.columns.forEach((c, i) => {
      const L = colLetter(4 + i);
      if (c.key === PEN_ATTR.band) lists.push({ sqref: `${L}{from}:${L}{to}`, formula: '"Band,No Band"' });
      else if (!isPenText(c.key) && list.length) lists.push({ sqref: `${L}{from}:${L}{to}`, formula: `Daftar!$A$1:$A$${list.length}` });
    });
    const intro = `Isi nama persis seperti di daftar pilihan (atau nama panggilan). Satu baris berlaku untuk Ibadah Minggu I dan II. Band/No Band: No Band membuat kolom Bass, Gitar, Drum diabaikan. Tambah kolom (mis. Gitar 2, atau alat baru) di bawah judul Pemusik dengan nama kolomnya. Padus dan Tema berupa teks bebas.${filled ? " Terisi dari jadwal yang sudah ada." : ""}${anyDiff ? " Bila Ibadah I dan II berbeda, yang tertulis adalah petugas Ibadah I." : ""}`;
    const spec = penSheet({ title: format.title, year, columns: lay.columns, groups: lay.groups, months }, { name: `Jadwal ${format.key.toUpperCase()} ${year}`, intro, lists });
    const out = [spec];
    if (list.length) out.push({ name: "Daftar", cols: [30], cells: list.map((v, i) => ({ r: i + 1, c: 1, v })), merges: [], lists: [] });
    return buildXlsx(out);
  }
  const cols = [...format.columns.map((c) => ({ key: c.key, label: c.label })), ...extra.map((x) => ({ key: x.key, label: x.label }))];
  const groups = groupsOf(format);
  const nc = cols.length;
  let r = 3;
  cells.push({ r: 1, c: 3, v: `${format.title} ${year}`, s: "bold" });
  const how = format.groups ? "KU1 untuk Ibadah Minggu I, KU2 untuk Ibadah Minggu II. Satu kursi satu nama." : "Satu baris berlaku untuk Ibadah Minggu I dan II. Satu kursi satu nama.";
  cells.push({ r: 2, c: 3, v: `Isi nama persis seperti di daftar pilihan (atau nama panggilan). ${how}${filled ? " Terisi dari jadwal yang sudah ada." : ""}${anyDiff ? " Bila Ibadah I dan II berbeda, yang tertulis adalah petugas Ibadah I." : ""}`, s: "note" });
  for (let month = 1; month <= 12; month++) {
    cells.push({ r, c: 3, v: MONTHS_ID[month - 1]!.toUpperCase(), s: "title" });
    for (let c = 4; c < 3 + nc + 1; c++) cells.push({ r, c, v: "", s: "title" });
    merges.push(`C${r}:${colLetter(3 + nc)}${r}`);
    r++;
    headerRow(cells, merges, r, cols, groups);
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
    if (list.length && r > first) lists.push({ sqref: `D${first}:${colLetter(3 + nc)}${r - 1}`, formula: `Daftar!$A$1:$A$${list.length}` });
    r += 2;
  }
  const main = { name: `Jadwal ${format.key.toUpperCase()} ${year}`, cols: [3, 3, 8, ...cols.map((c) => Math.max(14, c.label.length + 3))], cells, merges, lists };
  const sheets = [main];
  if (list.length) sheets.push({ name: "Daftar", cols: [30], cells: list.map((v, i) => ({ r: i + 1, c: 1, v })), merges: [], lists: [] });
  return buildXlsx(sheets);
}

// izin tampilan tombol (dipakai halaman)
export const canUploadSchedule = (u: AuthUser) => can(u, "assignment.write");

/** Format jadwal yang boleh dipakai pengguna ini: timnya ada, dan pengguna boleh mengatur tim itu (Admin Tim dibatasi ke timnya). */
export async function availableFormats(u: AuthUser): Promise<{ key: string; label: string; title: string; perService: boolean; pen: boolean }[]> {
  if (!can(u, "assignment.write")) return [];
  const out: { key: string; label: string; title: string; perService: boolean; pen: boolean }[] = [];
  for (const f of Object.values(ALL_FORMATS)) {
    try {
      authorize(u, await findTeam(u.tenantId, f));
      out.push({ key: f.key, label: f.teamShort, title: f.title, perService: !!f.groups, pen: !!f.pen });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e; // tim belum ada atau bukan tanggung jawab pengguna: format ini tidak ditawarkan
    }
  }
  return out;
}

/** Export ke Excel: satu blok per bulan, tata letak sama dengan template supaya bisa diunggah ulang. */
export function exportWorkbook(m: ExportModel): Buffer {
  if (m.pen && m.groups) {
    return buildXlsx([penSheet(
      { title: m.title, year: m.year, columns: m.columns, groups: m.groups, months: m.months.map((mo) => ({ name: mo.name, rows: mo.rows.map((r) => ({ day: r.day, cells: r.cells })) })) },
      { name: `Jadwal ${m.year}`, footnote: m.hasDiff ? 'Tanda "A / B": petugas Ibadah Minggu I dan II berbeda (I / II).' : undefined },
    )]);
  }
  const nc = m.columns.length;
  const cells: XCell[] = [];
  const merges: string[] = [];
  let r = 1;
  cells.push({ r, c: 3, v: `${m.title} ${m.year}`, s: "bold" });
  r = 3;
  for (const mo of m.months) {
    cells.push({ r, c: 3, v: mo.name, s: "title" });
    for (let c = 4; c <= 3 + nc; c++) cells.push({ r, c, v: "", s: "title" });
    merges.push(`C${r}:${colLetter(3 + nc)}${r}`);
    r++;
    headerRow(cells, merges, r, m.columns, m.groups);
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
