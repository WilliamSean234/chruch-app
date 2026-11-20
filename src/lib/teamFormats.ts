/**
 * Format jadwal per tim (kolom ↔ posisi pelayanan) dan pembaca file jadwal tahunan. Murni (tanpa database) supaya mudah diuji.
 *
 * Ada dua bentuk format:
 * - "bersama" (EBM): satu kolom per posisi, satu baris tanggal berlaku untuk kedua ibadah Minggu (I dan II).
 * - "per ibadah" (Usher): kolom dikelompokkan per ibadah (KU1 = Ibadah Minggu I, KU2 = Ibadah Minggu II), tiap kelompok berisi
 *   beberapa kursi untuk satu posisi yang sama. Jumlah kursi per kelompok mengikuti file.
 * Bentuk file: satu sheet. Baris judul bulan (opsional), baris header (TGL, lalu kolom atau kelompok kolom), lalu satu baris per hari Minggu.
 * Tanggal boleh angka hari (di bawah judul bulan) atau tanggal lengkap ("1 Nov 2026"), sehingga satu header untuk setahun juga terbaca.
 */
import type { XSheet } from "./importer/xlsx";
import { colLetter, type XCell } from "./xlsxWrite";

export type FormatColumn = {
  key: string; // pengenal tetap
  label: string; // judul kolom di file dan di hasil export
  ministry: string; // nama posisi di aplikasi
  aliases: string[]; // ejaan lain header di file (dinormalkan)
  service?: 1 | 2; // hanya untuk format per ibadah: kolom ini milik Ibadah Minggu I atau II (kosong = kedua ibadah)
  slotNo?: number; // nomor kursi untuk posisi yang punya beberapa kursi (default 1)
};

export type ServiceGroup = { service: 1 | 2; label: string; slots: number; aliases: string[] }; // slots = jumlah kursi bawaan

export type TeamFormat = {
  key: string; // "ebm"
  teamName: string; // nama tim bawaan bila perlu dibuat/dicari
  teamKind: "EBM" | "USHER"; // pengenal jenis tim (seatRules.teamKind)
  teamShort: string; // untuk teks di layar
  title: string; // untuk judul export
  columns: FormatColumn[];
  groups?: ServiceGroup[]; // hanya format per ibadah
  ministry?: string; // posisi tunggal untuk format per ibadah
};

export const MAX_SLOTS = 8;

export const EBM_FORMAT: TeamFormat = {
  key: "ebm",
  teamName: "Tim EBM",
  teamKind: "EBM",
  teamShort: "EBM",
  title: "JADWAL TIM EBM",
  columns: [
    { key: "pic", label: "PIC", ministry: "PIC EBM", aliases: ["PIC", "PICEBM"] },
    { key: "cameramen", label: "CAMERAMEN", ministry: "Cameramen", aliases: ["CAMERAMEN", "CAMERAMAN", "KAMERAMEN", "KAMERAMAN", "KAMERA", "CAMERA"] },
    { key: "soundman", label: "SOUNDMAN", ministry: "Soundman", aliases: ["SOUNDMAN", "SOUND", "SOUNDMEN"] },
    { key: "lighting", label: "LIGHTING+LED", ministry: "Lighting+LED", aliases: ["LIGHTING+LED", "LIGHTING", "LIGHT", "LIGHTINGLED"] },
    { key: "easyworship", label: "EASY WORSHIP LED", ministry: "Easy Worship LED", aliases: ["EASYWORSHIPLED", "EASYWORSHIP", "EW", "EWLED"] },
    { key: "ppt", label: "PPT PROMPTER", ministry: "PPT Prompter", aliases: ["PPTPROMPTER", "PPT", "PROMPTER"] },
    { key: "bm", label: "BM+VMOX", ministry: "BM+VMOX", aliases: ["BM+VMOX", "BMVMOX", "BM", "VMOX"] },
  ],
};

/** Kolom per ibadah dari jumlah kursi tiap kelompok: kunci s1_1, s1_2, …, s2_1, … */
export function withSlots(f: TeamFormat, counts: readonly [number, number]): TeamFormat {
  if (!f.groups) return f;
  const columns: FormatColumn[] = [];
  for (const g of f.groups) {
    const n = Math.max(1, Math.min(MAX_SLOTS, counts[g.service - 1] ?? g.slots));
    for (let k = 1; k <= n; k++) columns.push({ key: `s${g.service}_${k}`, label: `${g.label} #${k}`, ministry: f.ministry!, aliases: [], service: g.service, slotNo: k });
  }
  return { ...f, columns };
}

/** Usher: KU1 = Ibadah Minggu I (3 kursi), KU2 = Ibadah Minggu II (4 kursi). Jumlah kursi sebenarnya mengikuti file. */
export const USHER_FORMAT: TeamFormat = withSlots(
  {
    key: "usher",
    teamName: "Usher",
    teamKind: "USHER",
    teamShort: "Usher",
    title: "JADWAL USHER",
    ministry: "Usher",
    columns: [],
    groups: [
      { service: 1, label: "KU1", slots: 3, aliases: ["KU1", "KU 1", "KEBAKTIAN UMUM 1", "KEBAKTIAN UMUM I", "IBADAH 1", "IBADAH I", "IBADAH MINGGU 1", "IBADAH MINGGU I"] },
      { service: 2, label: "KU2", slots: 4, aliases: ["KU2", "KU 2", "KEBAKTIAN UMUM 2", "KEBAKTIAN UMUM II", "IBADAH 2", "IBADAH II", "IBADAH MINGGU 2", "IBADAH MINGGU II"] },
    ],
  },
  [3, 4],
);

export const FORMATS: Record<string, TeamFormat> = { ebm: EBM_FORMAT, usher: USHER_FORMAT };

/** Kelompok (KU1/KU2) yang dimaksud teks header ini; null bila bukan. */
export function serviceOfHead(f: TeamFormat, header: string): 1 | 2 | null {
  const h = normHead(header);
  if (!h) return null;
  return f.groups?.find((g) => g.aliases.some((a) => normHead(a) === h))?.service ?? null;
}

export const MONTHS_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// ───────── pembaca file ─────────

export type SheetRow = {
  date: string; // YYYY-MM-DD
  month: number; // 1–12
  line: number; // nomor baris di file
  names: Record<string, string>; // kunci kolom → teks apa adanya (kosong = tidak diisi)
};
export type ParseIssue = { line?: number; message: string };
export type ExtraColumn = { key: string; label: string; suggested: string }; // kolom di file yang belum dikenal format
export type ParseResult = {
  rows: SheetRow[]; errors: ParseIssue[]; warnings: ParseIssue[]; sheetName: string | null; extraColumns: ExtraColumn[];
  slotCounts: [number, number] | null; // format per ibadah: jumlah kursi KU1 dan KU2 yang terbaca di file
};

/** Kolom catatan biasa yang tidak ditawarkan sebagai pelayanan baru. */
const NOT_A_SERVICE = new Set(["KET", "KETERANGAN", "CATATAN", "NOTE", "NOTES", "NO", "NOMOR", "HARI", "BULAN"]);

/** "SPONSOR" → "Sponsor", "EASY WORSHIP" → "Easy Worship"; singkatan pendek (≤3 huruf) dan yang bercampur huruf kecil dibiarkan. */
export function suggestMinistryName(label: string): string {
  const t = label.replace(/\s+/g, " ").trim();
  if (t !== t.toUpperCase()) return t;
  return t.split(" ").map((w) => (w.length <= 3 || /[^A-Z]/.test(w) ? w : w[0] + w.slice(1).toLowerCase())).join(" ");
}

export const extraKey = (label: string) => `x_${normHead(label)}`;

const MONTH_WORDS: [number, string][] = [
  [1, "JANUARI"], [1, "JANUARY"], [2, "FEBRUARI"], [2, "FEBRUARY"], [3, "MARET"], [3, "MARCH"], [4, "APRIL"], [5, "MEI"], [5, "MAY"], [6, "JUNI"], [6, "JUNE"],
  [7, "JULI"], [7, "JULY"], [8, "AGUSTUS"], [8, "AUGUST"], [9, "SEPTEMBER"], [10, "OKTOBER"], [10, "OCTOBER"], [11, "NOVEMBER"], [11, "NOPEMBER"], [12, "DESEMBER"], [12, "DECEMBER"],
];

export const normHead = (s: string) => s.toUpperCase().replace(/[^A-Z0-9+]/g, "");

function edit(a: string, b: string): number {
  const d: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]!;
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length]!;
}

/** Nomor bulan bila teks ini nama bulan (toleran salah ketik, mis. "FEBUARI"), selain itu null. */
export function monthOf(text: string): number | null {
  const t = text.toUpperCase().replace(/[^A-Z]/g, "");
  if (t.length < 3) return null;
  let best: { m: number; d: number } | null = null;
  for (const [m, w] of MONTH_WORDS) {
    const d = edit(t, w);
    const limit = w.length <= 4 ? 0 : 2; // MEI dan MAY hanya cocok persis
    if (d <= limit && (!best || d < best.d)) best = { m, d };
  }
  return best?.m ?? null;
}

const MONTH_ABBR: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MEI: 5, MAY: 5, JUN: 6, JUL: 7, AGU: 8, AGT: 8, AUG: 8, SEP: 9, SEPT: 9, OKT: 10, OCT: 10, NOV: 11, NOP: 11, DES: 12, DEC: 12 };

/** Nomor bulan dari kata di tanggal lengkap: singkatan (Nov) atau nama bulan (November, termasuk salah ketik). */
function monthWord(word: string): number | null {
  const t = word.toUpperCase().replace(/[^A-Z]/g, "");
  return MONTH_ABBR[t] ?? monthOf(t);
}

/**
 * Tanggal lengkap dari teks: "2027-01-03", "3 Jan 2027", "3 Januari 2027", "Minggu, 3 Jan 2027", "03/01/2027" (hari/bulan/tahun).
 * Hanya membaca bentuknya; sah tidaknya tanggal diperiksa pemanggil.
 */
export function parseFullDate(raw: string): { y: number; m: number; d: number } | null {
  const t = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return { y: +m[1]!, m: +m[2]!, d: +m[3]! };
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return { y: +m[3]!, m: +m[2]!, d: +m[1]! };
  m = /^(?:[A-Za-z]+\.?,?\s+)?(\d{1,2})[\s./-]+([A-Za-z]+)\.?[\s./,-]+(\d{4})$/.exec(t);
  if (m) {
    const mo = monthWord(m[2]!);
    if (mo) return { y: +m[3]!, m: mo, d: +m[1]! };
  }
  return null;
}

const isoDate = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const validDay = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/** Cari kolom format dari teks header; null bila tidak dikenal. */
export function columnOf(format: TeamFormat, header: string): FormatColumn | null {
  const h = normHead(header);
  if (!h) return null;
  return format.columns.find((c) => c.aliases.some((a) => normHead(a) === h) || normHead(c.label) === h) ?? null;
}

const DATE_HEADS = new Set(["TGL", "TANGGAL", "DATE", "TANGGALIBADAH"]);

/** Teks yang tampak seperti tanggal baris jadwal: tanggal lengkap atau angka hari. */
const dateLike = (raw: string) => !!parseFullDate(raw) || /^\d{1,2}(\.0+)?$/.test(raw);
const isDateHead = (v: string) => DATE_HEADS.has(normHead(v));

export function parseTeamSheet(sheets: XSheet[], format: TeamFormat, year: number): ParseResult {
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const rows: SheetRow[] = [];
  const extras = new Map<string, ExtraColumn>();
  const grouped = !!format.groups;

  // judul bulan: satu sel yang berisi nama bulan (bukan tanggal lengkap seperti "3 Mei 2027")
  const isMonthTitle = (r: Map<number, string>) => r.size === 1 && !parseFullDate([...r.values()][0]!) && monthOf([...r.values()][0]!) !== null;
  const isGroupHeader = (r: Map<number, string>) => [...r.values()].some(isDateHead) && [...r.values()].some((v) => serviceOfHead(format, v));

  // format bersama: sheet pertama yang memuat nama bulan; format per ibadah: sheet pertama yang punya baris header TANGGAL + KU1/KU2
  const sheet = (grouped ? sheets.find((s) => [...s.cells.values()].some(isGroupHeader)) : sheets.find((s) => [...s.cells.values()].some(isMonthTitle))) ?? null;
  if (!sheet) {
    errors.push({
      message: grouped
        ? "Baris header tidak ditemukan. Pastikan ada baris dengan TANGGAL, KU1, dan KU2 (kolom nama di bawahnya). Pakai template dari halaman ini bila ragu."
        : "Tidak ada blok bulan (JANUARI, FEBRUARI, dst.) di file ini. Pakai template dari halaman ini, atau pastikan nama bulan ada di baris judul tiap blok.",
    });
    return { rows, errors, warnings, sheetName: null, extraColumns: [], slotCounts: null };
  }

  let month: number | null = null;
  let dateCol = -1;
  let colMap = new Map<number, { key: string; label: string }>();
  const seen = new Map<string, number>();
  const ignoredHeads = new Set<string>();
  const unknownHeads = new Set<string>();
  const counts: [number, number] = [0, 0];

  const lines = [...sheet.cells.keys()].sort((a, b) => a - b);
  for (const [li, line] of lines.entries()) {
    const cells = sheet.cells.get(line)!;
    const entries = [...cells.entries()].sort((a, b) => a[0] - b[0]);

    // judul bulan
    if (entries.length === 1 && isMonthTitle(cells)) {
      const m = monthOf(entries[0]![1]);
      if (m) { month = m; dateCol = -1; colMap = new Map(); continue; }
    }
    // baris header: ada sel TGL
    const head = entries.find(([, v]) => isDateHead(v));
    if (head) {
      dateCol = head[0];
      colMap = new Map();
      if (grouped) {
        // kelompok kolom (KU1, KU2): sel yang digabung hanya menyimpan nilai di kolom pertamanya. Lebar kelompok diambil dari sel gabungan;
        // bila tidak digabung, sampai kolom header berikutnya, dan kelompok terakhir sampai kolom terjauh yang terisi di baris tanggal di bawahnya.
        const others = entries.filter(([c]) => c !== dateCol).map(([c, v]) => ({ c, v, svc: serviceOfHead(format, v) }));
        let maxCol = Math.max(dateCol, ...others.map((x) => x.c));
        for (let j = li + 1; j < lines.length; j++) {
          const cs = sheet.cells.get(lines[j]!)!;
          if (isMonthTitle(cs) || [...cs.values()].some(isDateHead)) break;
          const dv = cs.get(dateCol);
          if (!dv || !dateLike(dv)) continue;
          for (const c of cs.keys()) if (c > maxCol) maxCol = c;
        }
        const taken = new Set<number>();
        for (const [i, o] of others.entries()) {
          if (o.svc) {
            if (taken.has(o.svc)) continue; // kelompok yang sama muncul dua kali di satu header: yang kedua diabaikan
            taken.add(o.svc);
            const g = format.groups!.find((x) => x.service === o.svc)!;
            const merged = sheet.merges?.find((m) => m.r1 === line && m.c1 === o.c); // sel gabungan memberi lebar yang pasti
            const end = merged ? merged.c2 : i + 1 < others.length ? others[i + 1]!.c - 1 : maxCol;
            let width = Math.max(1, end - o.c + 1);
            if (width > MAX_SLOTS) { warnings.push({ line, message: `Baris ${line}: ${g.label} punya ${width} kolom; hanya ${MAX_SLOTS} yang dipakai.` }); width = MAX_SLOTS; }
            for (let k = 1; k <= width; k++) colMap.set(o.c + k - 1, { key: `s${o.svc}_${k}`, label: `${g.label} #${k}` });
            counts[o.svc - 1] = Math.max(counts[o.svc - 1]!, width);
          } else {
            const label = o.v.replace(/\s+/g, " ").trim();
            const h = normHead(label);
            if (!h) continue;
            if (NOT_A_SERVICE.has(h)) ignoredHeads.add(label); else unknownHeads.add(label);
          }
        }
        continue;
      }
      for (const [c, v] of entries) {
        if (c === dateCol) continue;
        const col = columnOf(format, v);
        if (col) { colMap.set(c, col); continue; }
        const label = v.replace(/\s+/g, " ").trim();
        const h = normHead(label);
        if (!h) continue;
        if (NOT_A_SERVICE.has(h)) { ignoredHeads.add(label); continue; }
        const key = extraKey(label);
        if (!extras.has(key)) extras.set(key, { key, label, suggested: suggestMinistryName(label) });
        colMap.set(c, { key, label });
      }
      continue;
    }
    if (dateCol < 0) continue; // di luar blok (judul/catatan)
    if (!grouped && month === null) continue;

    const rawDate = cells.get(dateCol);
    if (!rawDate) {
      if (entries.some(([c]) => colMap.has(c))) errors.push({ line, message: `Baris ${line}: ada nama tetapi kolom TGL kosong.` });
      continue;
    }
    const full = parseFullDate(rawDate);
    const dayOnly = /^\d{1,2}(\.0+)?$/.test(rawDate);
    if (month === null && !full) continue; // tanpa judul bulan, hanya tanggal lengkap yang dibaca
    // catatan atau teks bebas di bawah blok (tidak ada nama di kolom posisi): bukan baris jadwal
    if (!full && !dayOnly && !entries.some(([c]) => colMap.has(c))) continue;

    let rowMonth = month;
    let day: number | null = null;
    if (full) {
      if (full.y !== year || (month !== null && full.m !== month)) {
        errors.push({ line, message: month !== null ? `Baris ${line}: tanggal ${rawDate} tidak sesuai blok ${MONTHS_ID[month - 1]} ${year}.` : `Baris ${line}: tanggal ${rawDate} tidak sesuai tahun ${year}.` });
        continue;
      }
      rowMonth = full.m; day = full.d;
    } else if (dayOnly) day = Math.round(Number(rawDate));
    if (rowMonth === null || day === null || day < 1 || day > 31 || !validDay(year, rowMonth, day)) {
      errors.push({ line, message: `Baris ${line}: tanggal "${rawDate}" tidak dikenali${rowMonth ? ` di ${MONTHS_ID[rowMonth - 1]} ${year}` : ""}.` });
      continue;
    }
    const date = isoDate(year, rowMonth, day);
    if (weekdayOf(date) !== 0) {
      errors.push({ line, message: `Baris ${line}: ${day} ${MONTHS_ID[rowMonth - 1]} ${year} bukan hari Minggu. Cek tahun yang dipilih atau tanggalnya.` });
      continue;
    }
    if (seen.has(date)) { errors.push({ line, message: `Baris ${line}: tanggal ${date} sudah ada di baris ${seen.get(date)}.` }); continue; }
    seen.set(date, line);

    const names: Record<string, string> = {};
    if (!grouped) for (const col of format.columns) names[col.key] = "";
    for (const k of extras.keys()) names[k] = "";
    for (const [c, v] of entries) {
      const col = colMap.get(c);
      if (!col) continue;
      let name = v.replace(/\s+/g, " ").trim();
      if (/[/,&]| dan /i.test(name)) {
        const first = name.split(/\s*(?:[/,&]|\bdan\b)\s*/i)[0]!.trim();
        warnings.push({ line, message: `Baris ${line} (${col.label}): "${name}" berisi lebih dari satu nama. Hanya "${first}" yang dipakai, karena satu kursi satu orang.` });
        name = first;
      }
      names[col.key] = name;
    }
    rows.push({ date, month: rowMonth, line, names });
  }

  let slotCounts: [number, number] | null = null;
  if (grouped) {
    const missing = format.groups!.filter((g) => !counts[g.service - 1]).map((g) => g.label);
    if (missing.length) errors.push({ message: `Kolom ${missing.join(" dan ")} tidak ditemukan di header. Header harus memuat TANGGAL, KU1, dan KU2.` });
    slotCounts = [counts[0] || format.groups![0]!.slots, counts[1] || format.groups![1]!.slots];
    for (const r of rows) for (const g of format.groups!) for (let k = 1; k <= slotCounts[g.service - 1]!; k++) r.names[`s${g.service}_${k}`] ??= "";
  }

  if (ignoredHeads.size) warnings.push({ message: `Kolom catatan dilewati: ${[...ignoredHeads].join(", ")}.` });
  if (unknownHeads.size) warnings.push({ message: `Kolom tidak dikenal dan dilewati: ${[...unknownHeads].join(", ")}.` });
  if (rows.length === 0 && errors.length === 0) {
    errors.push({ message: grouped ? "Tidak ada baris tanggal yang terbaca. Pastikan ada baris header (TANGGAL, KU1, KU2) dan baris tanggal di bawahnya." : "Tidak ada baris tanggal yang terbaca. Pastikan tiap blok bulan punya baris header (TGL, PIC, dst.) dan baris tanggal di bawahnya." });
  }
  return { rows, errors, warnings, sheetName: sheet.name, extraColumns: [...extras.values()], slotCounts };
}

// ───────── pencocokan nama ─────────

/** Gelar sapaan yang sering mendahului nama panggilan; dibuang saat mencari kemiripan. */
const HONORIFICS = new Set(["ko", "koko", "ce", "cece", "ci", "cici", "ev", "evg", "suk", "sukong", "pak", "bpk", "bu", "ibu", "kak", "kk", "om", "tante", "tan", "pdt", "ps", "pdm", "bro", "sis"]);

export const normName = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

export type Candidate = { id: string; name: string; nickname: string | null; aliases: string[]; nameKey: string; isMember: boolean };

/** guess = dugaan kuat (sama persis setelah sapaan dibuang, mis. "YOSI" ~ "Ko Yosi"); tetap perlu dikonfirmasi pengguna. */
export type MatchResult = { status: "MATCHED" | "AMBIGUOUS" | "NONE"; personId: string | null; suggestions: string[]; guess: string | null };

/**
 * Cocokkan nama di file ke orang.
 * - COCOK: persis sama dengan nama panggilan, ejaan lain, atau nama lengkap, dan hanya satu orang.
 * - Selain itu diberi saran (urut dari paling mirip) dan pengguna yang memilih.
 */
export function matchName(raw: string, people: Candidate[]): MatchResult {
  const n = normName(raw);
  if (!n) return { status: "NONE", personId: null, suggestions: [], guess: null };

  const exact = people.filter((p) => [p.nickname, ...p.aliases, p.name, p.nameKey].some((x) => x && normName(x) === n));
  if (exact.length === 1) return { status: "MATCHED", personId: exact[0]!.id, suggestions: [], guess: null };

  const tokens = n.split(" ").filter((t) => !HONORIFICS.has(t));
  const core = tokens.join(" ") || n;
  const score = (p: Candidate) => {
    const keys = [p.nickname, ...p.aliases, p.name, p.nameKey].filter((x): x is string => !!x).map(normName);
    let best = 0;
    for (const k of keys) {
      const kt = k.split(" ").filter((t) => !HONORIFICS.has(t));
      const kc = kt.join(" ") || k;
      if (kc === core) best = Math.max(best, 100);
      else if (kt[0] && tokens[0] && kt[0] === tokens[0]) best = Math.max(best, 80); // nama depan sama
      else if (core.length >= 3 && (kc.startsWith(core) || core.startsWith(kc))) best = Math.max(best, 70); // mis. "yudhis" ~ "yudhistira"
      else if (core.length >= 4 && edit(kc.split(" ")[0]!, tokens[0] ?? core) <= 1) best = Math.max(best, 60); // salah ketik satu huruf
    }
    return best;
  };
  const ranked = people
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s >= 60)
    .sort((a, b) => b.s + (b.p.isMember ? 5 : 0) - (a.s + (a.p.isMember ? 5 : 0)) || a.p.name.localeCompare(b.p.name, "id"));
  const guess = ranked[0] && ranked[0].s >= 100 && (ranked[1]?.s ?? 0) < 100 ? ranked[0].p.id : null;
  return { status: exact.length > 1 || ranked.length ? "AMBIGUOUS" : "NONE", personId: null, suggestions: ranked.slice(0, 6).map((x) => x.p.id), guess };
}

// ───────── tata letak file ─────────

/** Baris header: TGL lalu kolom; format per ibadah memakai sel gabungan per kelompok (KU1, KU2), seperti file aslinya. */
export function headerRow(cells: XCell[], merges: string[], r: number, columns: { key: string; label: string }[], groups: { label: string; keys: string[] }[] | null) {
  cells.push({ r, c: 3, v: "TGL", s: "head" });
  if (!groups) { columns.forEach((c, i) => cells.push({ r, c: 4 + i, v: c.label, s: "head" })); return; }
  for (const g of groups) {
    const first = columns.findIndex((c) => c.key === g.keys[0]);
    g.keys.forEach((_, k) => cells.push({ r, c: 4 + first + k, v: k === 0 ? g.label : "", s: "head" }));
    if (g.keys.length > 1) merges.push(`${colLetter(4 + first)}${r}:${colLetter(4 + first + g.keys.length - 1)}${r}`);
  }
}
