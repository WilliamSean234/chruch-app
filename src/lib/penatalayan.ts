/**
 * Format jadwal Penatalayan ibadah (pemusik, Liturgos/WL, Backing Vocal, PIC) beserta Band/No Band, Padus, dan Tema. Murni (tanpa database).
 *
 * Bentuk file: satu baris tanggal berlaku untuk Ibadah Minggu I dan II (seperti EBM). Header dua baris dengan sel gabungan, seperti file aslinya:
 *   TGL | Liturgos | Pemusik: [Band/No Band, Keyboard, Piano, Bass, Gitar, Drum, …] | Backing Vocal: [Singer 1, Singer 2, …] | PIC | Padus | Tema
 * Kolom dinamis: "Gitar 2", "Singer 3", atau alat musik baru cukup ditambahkan di baris judul kolom. Kolom yang tidak ada di file tidak dipakai.
 */
import type { XSheet } from "./importer/xlsx";
import type { XCell, XSheetSpec } from "./xlsxWrite";
import { colLetter } from "./xlsxWrite";
import {
  MAX_SLOTS, MONTHS_ID, NOT_A_SERVICE, extraKey, isDateHead, isoDate, monthOf, normHead, parseFullDate, suggestMinistryName, validDay, weekdayOf,
  type ExtraColumn, type FormatColumn, type ParseIssue, type ParseResult, type RowAttrs, type SheetRow, type TeamFormat,
} from "./teamFormats";

export const PEN_THEME_MAX = 600;
export const PEN_PADUS_MAX = 200;

export type PenBase = { key: string; label: string; ministry: string; group: "" | "PEMUSIK" | "BV"; aliases: string[]; bandOnly?: boolean; def: number };

/** Urutan di sini = urutan kolom di file. */
export const PEN_BASES: PenBase[] = [
  { key: "lit", label: "Liturgos", ministry: "Liturgos (WL)", group: "", aliases: ["LITURGOS", "LITURGOSWL", "WL", "WORSHIPLEADER", "PEMANDUPUJIAN"], def: 1 },
  { key: "keyboard", label: "Keyboard", ministry: "Keyboard", group: "PEMUSIK", aliases: ["KEYBOARD", "KEYBOARDS", "KEY", "KEYS"], def: 1 },
  { key: "piano", label: "Piano", ministry: "Piano", group: "PEMUSIK", aliases: ["PIANO", "PIANIS"], def: 1 },
  { key: "bass", label: "Bass", ministry: "Bass", group: "PEMUSIK", aliases: ["BASS", "BASSIS", "BAS"], bandOnly: true, def: 1 },
  { key: "gitar", label: "Gitar", ministry: "Gitar", group: "PEMUSIK", aliases: ["GITAR", "GUITAR", "GITARIS"], bandOnly: true, def: 1 },
  { key: "drum", label: "Drum", ministry: "Drum", group: "PEMUSIK", aliases: ["DRUM", "DRUMS", "DRUMMER"], bandOnly: true, def: 1 },
  { key: "singer", label: "Singer", ministry: "Singer", group: "BV", aliases: ["SINGER", "SINGERS", "BACKINGVOCAL", "BACKVOCAL", "BV", "VOCAL", "VOKALIS"], def: 2 },
  { key: "pic", label: "PIC", ministry: "PIC", group: "", aliases: ["PIC", "PICPENATALAYAN"], def: 1 },
];
export const PEN_DEFAULT_COUNTS: Record<string, number> = Object.fromEntries(PEN_BASES.map((b) => [b.key, b.def]));

export const PEN_ATTR = { band: "@band", padus: "@padus", theme: "@theme" } as const;
const GROUP_LABEL = { PEMUSIK: "Pemusik", BV: "Backing Vocal" } as const;

const BAND_HEADS = new Set(["BAND", "NOBAND", "BANDNOBAND", "BANDATAUNOBAND", "MODE", "TIPE", "JENIS"]);
const PADUS_HEADS = new Set(["PADUS", "PADUANSUARA", "CHOIR", "PS"]);
const THEME_HEADS = new Set(["TEMA", "THEME", "TEMAIBADAH", "TEMAKHOTBAH"]);
const MUSIC_HEADS = new Set(["PEMUSIK", "MUSIK", "MUSIC", "PEMUSIKBAND", "BANDPEMUSIK", "ALATMUSIK"]);
const BV_HEADS = new Set(["BACKINGVOCAL", "BACKVOCAL", "BV", "SINGER", "SINGERS", "VOCAL", "VOKALIS"]);

export const PENATALAYAN_FORMAT: TeamFormat = {
  key: "penatalayan",
  teamName: "Penatalayan ibadah",
  teamKind: "PIMPINAN",
  teamShort: "Penatalayan",
  title: "JADWAL PENATALAYAN IBADAH",
  columns: penColumns(PEN_DEFAULT_COUNTS),
  pen: true,
  preserve: ["Pembicara"],
};

/** Kolom kursi dari jumlah kursi tiap posisi dasar. Kunci: gitar, gitar_2, gitar_3, … */
export function penColumns(counts: Record<string, number>): FormatColumn[] {
  const out: FormatColumn[] = [];
  for (const b of PEN_BASES) {
    const n = Math.max(0, Math.min(MAX_SLOTS, Math.floor(counts[b.key] ?? 0)));
    for (let k = 1; k <= n; k++) {
      out.push({ key: k === 1 ? b.key : `${b.key}_${k}`, label: n > 1 ? `${b.label} ${k}` : b.label, ministry: b.ministry, aliases: [], slotNo: k, group: b.group, bandOnly: b.bandOnly, base: b.key });
    }
  }
  return out;
}
export const withPenSlots = (f: TeamFormat, counts: Record<string, number>): TeamFormat => ({ ...f, columns: penColumns(counts) });

/** Jumlah kursi dari isian pemanggil (nilai aneh diabaikan); posisi yang tidak disebut = tidak dipakai. */
export function sanitizePenCounts(raw: Record<string, number> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of PEN_BASES) { const n = raw?.[b.key]; if (Number.isInteger(n) && n! > 0) out[b.key] = Math.min(n!, MAX_SLOTS); }
  return out;
}

// ───────── tata letak (header dua baris) ─────────

export type PenGroup = { label: string; keys: string[]; single?: boolean };

/**
 * Urutan kolom dan kelompoknya untuk file/gambar: Liturgos | Pemusik [Band/No Band, instrumen, …] | Backing Vocal | PIC | Padus | Tema.
 * `extras` = alat musik tambahan (posisi di luar yang baku), diletakkan sesudah Drum di kelompok Pemusik.
 */
export function penLayout(seatCols: FormatColumn[], extras: { key: string; label: string }[]): { columns: { key: string; label: string }[]; groups: PenGroup[] } {
  const columns: { key: string; label: string }[] = [];
  const groups: PenGroup[] = [];
  const add = (label: string, cols: { key: string; label: string }[], single = false) => {
    if (!cols.length) return;
    groups.push({ label, keys: cols.map((c) => c.key), ...(single ? { single: true } : {}) });
    columns.push(...cols);
  };
  const of = (b: PenBase) => seatCols.filter((c) => c.base === b.key).map((c) => ({ key: c.key, label: c.label }));
  const base = (k: string) => PEN_BASES.find((b) => b.key === k)!;
  const lit = of(base("lit"));
  add("Liturgos", lit, lit.length === 1);
  const music = [{ key: PEN_ATTR.band, label: "Band/No Band" }, ...PEN_BASES.filter((b) => b.group === "PEMUSIK").flatMap(of), ...extras];
  add(GROUP_LABEL.PEMUSIK, music);
  add(GROUP_LABEL.BV, of(base("singer")));
  add("PIC", of(base("pic")), true);
  add("Padus", [{ key: PEN_ATTR.padus, label: "Padus" }], true);
  add("Tema", [{ key: PEN_ATTR.theme, label: "Tema" }], true);
  return { columns, groups };
}

/** Lebar kolom relatif (gambar/PDF) dan lebar kolom Excel. */
export const penWeight = (key: string) => (key === PEN_ATTR.theme ? 3.2 : key === PEN_ATTR.padus ? 1.7 : key === PEN_ATTR.band ? 0.9 : 1);
export const penXlsxWidth = (key: string, label: string) => (key === PEN_ATTR.theme ? 48 : key === PEN_ATTR.padus ? 24 : key === PEN_ATTR.band ? 13 : Math.max(14, label.length + 3));
export const isPenText = (key: string) => key === PEN_ATTR.theme || key === PEN_ATTR.padus;

export type SheetModel = {
  title: string; year: number;
  columns: { key: string; label: string }[]; groups: PenGroup[];
  months: { name: string; rows: { day: number; cells: Record<string, string> }[] }[];
};

/** Satu sheet Excel: judul, lalu per bulan: judul bulan, dua baris header (sel gabungan), baris tanggal. Dipakai export dan template. */
export function penSheet(m: SheetModel, opts: { name: string; intro?: string; footnote?: string; lists?: { sqref: string; formula: string }[] }): XSheetSpec {
  const cells: XCell[] = [];
  const merges: string[] = [];
  const nc = m.columns.length;
  const last = colLetter(3 + nc);
  let r = 1;
  cells.push({ r, c: 3, v: `${m.title} ${m.year}`, s: "bold" });
  if (opts.intro) cells.push({ r: 2, c: 3, v: opts.intro, s: "note" });
  r = 3;
  const lists: { sqref: string; formula: string }[] = [];
  for (const mo of m.months) {
    cells.push({ r, c: 3, v: mo.name, s: "title" });
    for (let c = 4; c <= 3 + nc; c++) cells.push({ r, c, v: "", s: "title" });
    merges.push(`C${r}:${last}${r}`);
    r++;
    // header baris 1 (kelompok) dan baris 2 (nama kolom)
    cells.push({ r, c: 3, v: "TGL", s: "head" }, { r: r + 1, c: 3, v: "", s: "head" });
    merges.push(`C${r}:C${r + 1}`);
    for (const g of m.groups) {
      const i0 = m.columns.findIndex((c) => c.key === g.keys[0]);
      const col0 = 4 + i0;
      if (g.single) {
        cells.push({ r, c: col0, v: g.label, s: "head" }, { r: r + 1, c: col0, v: "", s: "head" });
        merges.push(`${colLetter(col0)}${r}:${colLetter(col0)}${r + 1}`);
        continue;
      }
      g.keys.forEach((k, j) => {
        cells.push({ r, c: col0 + j, v: j === 0 ? g.label : "", s: "head" });
        cells.push({ r: r + 1, c: col0 + j, v: m.columns[i0 + j]!.label, s: "head" });
      });
      if (g.keys.length > 1) merges.push(`${colLetter(col0)}${r}:${colLetter(col0 + g.keys.length - 1)}${r}`);
    }
    r += 2;
    const first = r;
    for (const row of mo.rows) {
      cells.push({ r, c: 3, v: row.day, s: "center" });
      m.columns.forEach((c, i) => cells.push({ r, c: 4 + i, v: row.cells[c.key] ?? "", s: isPenText(c.key) ? "wrap" : "cell" }));
      r++;
    }
    for (const l of opts.lists ?? []) {
      // `{from}`/`{to}` diganti baris pertama dan terakhir blok bulan ini
      if (r > first) lists.push({ sqref: l.sqref.replace(/\{from\}/g, String(first)).replace(/\{to\}/g, String(r - 1)), formula: l.formula });
    }
    r += 2;
  }
  if (opts.footnote) cells.push({ r, c: 3, v: opts.footnote, s: "note" });
  return { name: opts.name, cols: [3, 3, 8, ...m.columns.map((c) => penXlsxWidth(c.key, c.label))], cells, merges, lists };
}

// ───────── pembersihan isi sel ─────────

const EMPTY_WORDS = new Set(["-", "–", "—", "?", "TBC", "TBA", "TBD", "NA", "N/A", "KOSONG", "BELUMADA", "BELUMDIISI"]);

/**
 * Isi sel kursi → satu nama. Catatan dalam kurung dibuang ("Kevin (B)", "Albert (Cajoon)"), "A ganti B" dibaca sebagai A,
 * "Kevin (B) Immanuel (G)" dan "Kevin & Welly" dibaca dua orang (yang kedua dikembalikan di `others`; satu kursi satu orang).
 */
export function cleanPenName(raw: string): { name: string; others: string[]; notes: string[] } {
  const notes: string[] = [];
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return { name: "", others: [], notes };
  const people: string[] = [];
  for (const piece of t.split(/(?<=\))\s+(?=[^\s(])/)) {
    for (const m of piece.matchAll(/\(([^)]*)\)/g)) if (m[1]!.trim()) notes.push(m[1]!.trim());
    const bare = piece.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    for (const part of bare.split(/\s*(?:[/,&]|\bdan\b)\s*/i)) {
      const [who, ...rest] = part.trim().split(/\s+ganti\s+/i);
      if (rest.length) notes.push(`ganti ${rest.join(" ganti ")}`);
      if (who && who.trim()) people.push(who.trim());
    }
  }
  const real = people.filter((p) => !EMPTY_WORDS.has(normHead(p)) && !EMPTY_WORDS.has(p.toUpperCase()));
  return { name: real[0] ?? "", others: real.slice(1), notes };
}

/** Catatan dalam kurung yang cuma satu huruf (B), (G) hanyalah penanda alat; tidak perlu dilaporkan. */
const meaningfulNote = (n: string) => !/^[a-z]$/i.test(n);

const collapse = (s: string) => s.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

export function parseBand(raw: string): "BAND" | "NO_BAND" | null | undefined {
  const t = normHead(raw.replace(/\([^)]*\)/g, " "));
  if (!t) return null;
  if (t.startsWith("NOBAND") || t === "NB" || t.startsWith("TANPABAND")) return "NO_BAND";
  if (t.startsWith("BAND")) return "BAND";
  return undefined; // tidak dikenal
}

// ───────── pembaca file ─────────

type Spec = { kind: "seat"; key: string; label: string; base: string | null } | { kind: "band" } | { kind: "padus" } | { kind: "theme" };

function baseOf(label: string): { base: PenBase; slot: number } | null {
  const n = normHead(label);
  const m = /^(.*?)(\d+)$/.exec(n);
  const stem = m && m[1] ? m[1] : n;
  const slot = m && m[1] ? Number(m[2]) : 0;
  const base = PEN_BASES.find((b) => b.aliases.includes(stem) || normHead(b.label) === stem);
  return base ? { base, slot } : null;
}

export function parsePenSheet(sheets: XSheet[], format: TeamFormat, year: number): ParseResult {
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const rows: SheetRow[] = [];
  const extras = new Map<string, ExtraColumn>();
  const counts: Record<string, number> = {};
  const attrCols = { band: false, padus: false, theme: false };
  const ignored = new Set<string>();
  const noteSamples: string[] = [];
  let noteCount = 0;
  void format;

  const isMonthTitle = (r: Map<number, string>) => r.size === 1 && !parseFullDate([...r.values()][0]!) && monthOf([...r.values()][0]!) !== null;
  // semua sheet yang punya judul bulan atau baris header (TGL) dibaca; bisa satu sheet setahun atau satu sheet per bulan
  const cands = sheets.filter((s) => [...s.cells.values()].some((r) => isMonthTitle(r) || [...r.values()].some(isDateHead)));
  if (!cands.length) {
    errors.push({ message: "Tidak ada blok bulan (JANUARI, FEBRUARI, dst.) atau baris header (TGL, Liturgos, …) di file ini. Pakai template dari halaman ini bila ragu." });
    return { rows, errors, warnings, sheetName: null, extraColumns: [], slotCounts: null, penSlots: null };
  }

  let musicWithoutNames = false;
  const seen = new Map<string, number>();
  const dateLike = (raw: string | undefined) => !!raw && (!!parseFullDate(raw.replace(/\([^)]*\)/g, "").trim()) || /^\d{1,2}(\.0+)?$/.test(raw.trim()));

  for (const sheet of cands) {
  let month: number | null = null;
  let dateCol = -1;
  let colMap = new Map<number, Spec>();
  const lines = [...sheet.cells.keys()].sort((a, b) => a - b);
  const consumed = new Set<number>();
  for (const [li, line] of lines.entries()) {
    if (consumed.has(line)) continue;
    const cells = sheet.cells.get(line)!;
    const entries = [...cells.entries()].sort((a, b) => a[0] - b[0]);

    if (entries.length === 1 && isMonthTitle(cells)) {
      const m = monthOf(entries[0]![1]);
      if (m) { month = m; dateCol = -1; colMap = new Map(); continue; }
    }

    const head = entries.find(([, v]) => isDateHead(v));
    if (head) {
      dateCol = head[0];
      colMap = new Map();
      // baris kedua header (nama kolom di bawah kelompok): baris berikutnya yang tidak punya tanggal
      const nextLine = lines[li + 1];
      const next = nextLine === line + 1 ? sheet.cells.get(nextLine) : undefined;
      const sub = next && !dateLike(next.get(dateCol)) && !isMonthTitle(next) && ![...next.values()].some(isDateHead) && [...next.keys()].some((c) => c !== dateCol) ? next : undefined;
      if (sub) consumed.add(nextLine!);

      const tops = entries.filter(([c]) => c !== dateCol);
      const subMax = sub ? Math.max(0, ...sub.keys()) : 0;
      const used = new Map<string, Set<number>>();
      const place = (label: string, hint: "PEMUSIK" | "BV" | ""): Spec | null => {
        const n = normHead(label);
        if (!n) return null;
        if (BAND_HEADS.has(n)) { attrCols.band = true; return { kind: "band" }; }
        if (PADUS_HEADS.has(n)) { attrCols.padus = true; return { kind: "padus" }; }
        if (THEME_HEADS.has(n)) { attrCols.theme = true; return { kind: "theme" }; }
        const b = baseOf(label);
        if (b) {
          const taken = used.get(b.base.key) ?? new Set<number>();
          let slot = b.slot || 1;
          while (taken.has(slot)) slot++;
          if (slot > MAX_SLOTS) { warnings.push({ line, message: `Baris ${line}: kolom "${label}" melebihi ${MAX_SLOTS} kursi dan dilewati.` }); return null; }
          taken.add(slot); used.set(b.base.key, taken);
          counts[b.base.key] = Math.max(counts[b.base.key] ?? 0, slot);
          return { kind: "seat", key: slot === 1 ? b.base.key : `${b.base.key}_${slot}`, label: slot > 1 || (counts[b.base.key] ?? 1) > 1 ? `${b.base.label} ${slot}` : b.base.label, base: b.base.key };
        }
        if (NOT_A_SERVICE.has(n)) { ignored.add(label.trim()); return null; }
        void hint;
        const clean = label.replace(/\s+/g, " ").trim();
        const key = extraKey(clean);
        if (!extras.has(key)) extras.set(key, { key, label: clean, suggested: suggestMinistryName(clean) });
        return { kind: "seat", key, label: clean, base: null };
      };

      for (const [i, [c, text]] of tops.entries()) {
        const merged = sheet.merges?.find((m) => m.r1 === line && m.c1 === c);
        const end = merged ? merged.c2 : i + 1 < tops.length ? tops[i + 1]![0] - 1 : Math.max(c, subMax);
        const n = normHead(text);
        const hint: "PEMUSIK" | "BV" | "" = MUSIC_HEADS.has(n) ? "PEMUSIK" : BV_HEADS.has(n) ? "BV" : "";
        const subLabels = sub ? [...Array(end - c + 1).keys()].map((k) => ({ col: c + k, label: (sub.get(c + k) ?? "").trim() })).filter((x) => x.label) : [];
        if (subLabels.length) {
          for (const x of subLabels) { const sp = place(x.label, hint); if (sp) colMap.set(x.col, sp); }
        } else {
          const knownAttr = BAND_HEADS.has(n) || PADUS_HEADS.has(n) || THEME_HEADS.has(n);
          if (hint === "PEMUSIK" || (end > c && !baseOf(text) && !knownAttr)) { musicWithoutNames = true; continue; }
          const sp = place(text, hint);
          if (sp) colMap.set(c, sp);
          // kelompok tanpa judul kolom tetapi bernama posisi (mis. "Backing Vocal" digabung 2 kolom): kolomnya kursi 1, 2, …
          if (sp?.kind === "seat" && sp.base && end > c) for (let cc = c + 1; cc <= end; cc++) { const s2 = place(text, hint); if (s2) colMap.set(cc, s2); }
        }
      }
      continue;
    }
    if (dateCol < 0) continue;

    const rawDate = cells.get(dateCol);
    const seatLike = entries.some(([c]) => colMap.has(c));
    if (!rawDate) {
      if (seatLike) errors.push({ line, message: `Baris ${line}: ada isian tetapi kolom TGL kosong.` });
      continue;
    }
    const dateText = rawDate.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    if (dateText !== rawDate.trim()) { noteCount++; if (noteSamples.length < 4) noteSamples.push(`Baris ${line} (tanggal): "${rawDate.trim()}"`); }
    const full = parseFullDate(dateText);
    const dayOnly = /^\d{1,2}(\.0+)?$/.test(dateText);
    if (month === null && !full) continue;
    if (!full && !dayOnly && !seatLike) continue;

    let rowMonth = month;
    let day: number | null = null;
    if (full) {
      if (full.y !== year || (month !== null && full.m !== month)) {
        errors.push({ line, message: month !== null ? `Baris ${line}: tanggal ${rawDate} tidak sesuai blok ${MONTHS_ID[month - 1]} ${year}.` : `Baris ${line}: tanggal ${rawDate} tidak sesuai tahun ${year}.` });
        continue;
      }
      rowMonth = full.m; day = full.d;
    } else if (dayOnly) day = Math.round(Number(dateText));
    if (rowMonth === null || day === null || day < 1 || day > 31 || !validDay(year, rowMonth, day)) {
      errors.push({ line, message: `Baris ${line}: tanggal "${rawDate}" tidak dikenali${rowMonth ? ` di ${MONTHS_ID[rowMonth - 1]} ${year}` : ""}.` });
      continue;
    }
    const date = isoDate(year, rowMonth, day);
    if (weekdayOf(date) !== 0) { errors.push({ line, message: `Baris ${line}: ${day} ${MONTHS_ID[rowMonth - 1]} ${year} bukan hari Minggu. Cek tahun yang dipilih atau tanggalnya.` }); continue; }
    if (seen.has(date)) { errors.push({ line, message: `Baris ${line}: tanggal ${date} sudah ada di baris ${seen.get(date)}.` }); continue; }
    seen.set(date, line);

    const names: Record<string, string> = {};
    const attrs: RowAttrs = {};
    const seatBase = new Map<string, string | null>();
    for (const c of [...colMap.keys()].sort((a, b) => a - b)) { // sel kosong juga dibaca: kolom Padus/Tema yang dikosongkan berarti dikosongkan
      const sp = colMap.get(c)!;
      const v = cells.get(c) ?? "";
      if (sp.kind === "band") {
        const b = parseBand(v);
        if (b === undefined) warnings.push({ line, message: `Baris ${line}: "${v.trim()}" di kolom Band/No Band tidak dikenali (isi Band atau No Band). Dilewati.` });
        attrs.band = b === undefined ? null : b;
      } else if (sp.kind === "padus") {
        let t = collapse(v);
        if (t.length > PEN_PADUS_MAX) { warnings.push({ line, message: `Baris ${line}: catatan Padus dipotong menjadi ${PEN_PADUS_MAX} huruf.` }); t = t.slice(0, PEN_PADUS_MAX); }
        attrs.padus = t;
      } else if (sp.kind === "theme") {
        let t = collapse(v);
        if (t.length > PEN_THEME_MAX) { warnings.push({ line, message: `Baris ${line}: Tema dipotong menjadi ${PEN_THEME_MAX} huruf.` }); t = t.slice(0, PEN_THEME_MAX); }
        attrs.theme = t;
      } else {
        const r = cleanPenName(v);
        const notes = r.notes.filter(meaningfulNote);
        if (notes.length) { noteCount++; if (noteSamples.length < 4) noteSamples.push(`Baris ${line} (${sp.label}): "${v.replace(/\s+/g, " ").trim()}"`); }
        if (r.others.length) warnings.push({ line, message: `Baris ${line} (${sp.label}): "${v.replace(/\s+/g, " ").trim()}" berisi lebih dari satu nama. Hanya "${r.name}" yang dipakai, karena satu kursi satu orang. Tambahkan kolom lain (mis. "${sp.base ? PEN_BASES.find((b) => b.key === sp.base)!.label : sp.label} 2") untuk nama berikutnya.` });
        names[sp.key] = r.name;
        seatBase.set(sp.key, sp.base);
      }
    }
    // No Band: posisi band (bass, gitar, drum) tidak dipakai; isian di kolom itu diabaikan
    if (attrs.band === "NO_BAND") {
      const bandOnly = new Set(PEN_BASES.filter((b) => b.bandOnly).map((b) => b.key));
      const dropped: string[] = [];
      for (const [k, b] of seatBase) if (b && bandOnly.has(b) && names[k]) { dropped.push(`${names[k]}`); names[k] = ""; }
      if (dropped.length) warnings.push({ line, message: `Baris ${line}: ibadah ini No Band, jadi ${dropped.join(", ")} di kolom band diabaikan.` });
    }
    rows.push({ date, month: rowMonth, line, names, attrs });
  }
  }

  if (musicWithoutNames) {
    errors.push({ message: 'Kolom di bawah "Pemusik" belum diberi nama. Tambahkan baris judul kolom di bawah header (Band/No Band, Keyboard, Piano, Bass, Gitar, Drum, Gitar 2, …) atau pakai template dari halaman ini.' });
  }
  if (!Object.keys(counts).length && !musicWithoutNames) {
    errors.push({ message: "Tidak ada kolom pelayanan yang dikenal (Liturgos, Keyboard, Piano, Bass, Gitar, Drum, Singer, PIC). Pakai template dari halaman ini bila ragu." });
  }
  if (noteCount) warnings.push({ message: `${noteCount} isian punya catatan dalam kurung atau kata "ganti" yang dilewati, mis. ${noteSamples.join("; ")}. Hanya nama orangnya yang dipakai.` });
  if (ignored.size) warnings.push({ message: `Kolom catatan dilewati: ${[...ignored].join(", ")}.` });

  // semua kolom bernama kosong bila baris itu tidak mengisinya
  const keys = [...penColumns(counts).map((c) => c.key), ...extras.keys()];
  for (const r of rows) for (const k of keys) r.names[k] ??= "";

  if (rows.length === 0 && errors.length === 0) {
    errors.push({ message: "Tidak ada baris tanggal yang terbaca. Pastikan tiap blok bulan punya baris header (TGL, Liturgos, Pemusik, …) dan baris tanggal di bawahnya." });
  }
  return { rows, errors, warnings, sheetName: cands.map((c) => c.name).join(", "), extraColumns: [...extras.values()], slotCounts: null, penSlots: counts };
}
