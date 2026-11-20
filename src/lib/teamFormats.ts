/**
 * Format jadwal per tim (kolom ↔ posisi pelayanan) dan pembaca file jadwal tahunan. Murni (tanpa database) supaya mudah diuji.
 *
 * Saat ini baru tim EBM. Tim lain (pemusik, usher, dst.) cukup menambah format baru di `FORMATS`.
 * Bentuk file: satu sheet, tiap bulan satu blok. Baris judul bulan (satu sel), baris header (TGL, lalu satu kolom per posisi),
 * lalu satu baris per hari Minggu. Satu baris berlaku untuk kedua ibadah Minggu (I dan II).
 */
import type { XSheet } from "./importer/xlsx";

export type FormatColumn = {
  key: string; // pengenal tetap
  label: string; // judul kolom di file dan di hasil export
  ministry: string; // nama posisi di aplikasi
  aliases: string[]; // ejaan lain header di file (dinormalkan)
};

export type TeamFormat = {
  key: string; // "ebm"
  teamName: string; // nama tim bawaan bila perlu dibuat/dicari
  title: string; // untuk judul export
  columns: FormatColumn[];
};

export const EBM_FORMAT: TeamFormat = {
  key: "ebm",
  teamName: "Tim EBM",
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

export const FORMATS: Record<string, TeamFormat> = { ebm: EBM_FORMAT };

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
export type ParseResult = { rows: SheetRow[]; errors: ParseIssue[]; warnings: ParseIssue[]; sheetName: string | null; extraColumns: ExtraColumn[] };

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

export function parseTeamSheet(sheets: XSheet[], format: TeamFormat, year: number): ParseResult {
  const errors: ParseIssue[] = [];
  const warnings: ParseIssue[] = [];
  const rows: SheetRow[] = [];
  const extras = new Map<string, ExtraColumn>();

  // pakai sheet pertama yang memuat nama bulan
  const sheet = sheets.find((s) => [...s.cells.values()].some((r) => r.size === 1 && monthOf([...r.values()][0]!) !== null)) ?? null;
  if (!sheet) {
    errors.push({ message: "Tidak ada blok bulan (JANUARI, FEBRUARI, dst.) di file ini. Pakai template dari halaman ini, atau pastikan nama bulan ada di baris judul tiap blok." });
    return { rows, errors, warnings, sheetName: null, extraColumns: [] };
  }

  let month: number | null = null;
  let dateCol = -1;
  let colMap = new Map<number, { key: string; label: string }>();
  const seen = new Map<string, number>();
  const ignoredHeads = new Set<string>();

  const lines = [...sheet.cells.keys()].sort((a, b) => a - b);
  for (const line of lines) {
    const cells = sheet.cells.get(line)!;
    const entries = [...cells.entries()].sort((a, b) => a[0] - b[0]);

    // judul bulan: satu sel saja yang berisi nama bulan
    if (entries.length === 1) {
      const m = monthOf(entries[0]![1]);
      if (m) { month = m; dateCol = -1; colMap = new Map(); continue; }
    }
    // baris header: ada sel TGL
    const head = entries.find(([, v]) => DATE_HEADS.has(normHead(v)));
    if (head) {
      dateCol = head[0];
      colMap = new Map();
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
    if (month === null || dateCol < 0) continue; // di luar blok (judul/catatan)

    const rawDate = cells.get(dateCol);
    if (!rawDate) {
      if (entries.some(([c]) => colMap.has(c))) errors.push({ line, message: `Baris ${line}: ada nama tetapi kolom TGL kosong.` });
      continue;
    }
    // catatan atau teks bebas di bawah blok (tidak ada nama di kolom posisi): bukan baris jadwal
    const looksDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) || /^\d{1,2}(\.0+)?$/.test(rawDate);
    if (!looksDate && !entries.some(([c]) => colMap.has(c))) continue;
    let day: number | null = null;
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate);
    if (iso) {
      if (+iso[1]! !== year || +iso[2]! !== month) { errors.push({ line, message: `Baris ${line}: tanggal ${rawDate} tidak sesuai blok ${MONTHS_ID[month - 1]} ${year}.` }); continue; }
      day = +iso[3]!;
    } else if (/^\d{1,2}(\.0+)?$/.test(rawDate)) day = Math.round(Number(rawDate));
    if (day === null || day < 1 || day > 31 || !validDay(year, month, day)) {
      errors.push({ line, message: `Baris ${line}: tanggal "${rawDate}" tidak dikenali di ${MONTHS_ID[month - 1]} ${year}.` });
      continue;
    }
    const date = isoDate(year, month, day);
    if (weekdayOf(date) !== 0) {
      errors.push({ line, message: `Baris ${line}: ${day} ${MONTHS_ID[month - 1]} ${year} bukan hari Minggu. Cek tahun yang dipilih atau tanggalnya.` });
      continue;
    }
    if (seen.has(date)) { errors.push({ line, message: `Baris ${line}: tanggal ${date} sudah ada di baris ${seen.get(date)}.` }); continue; }
    seen.set(date, line);

    const names: Record<string, string> = {};
    for (const col of format.columns) names[col.key] = "";
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
    rows.push({ date, month, line, names });
  }

  if (ignoredHeads.size) warnings.push({ message: `Kolom catatan dilewati: ${[...ignoredHeads].join(", ")}.` });
  if (rows.length === 0 && errors.length === 0) errors.push({ message: "Tidak ada baris tanggal yang terbaca. Pastikan tiap blok bulan punya baris header (TGL, PIC, dst.) dan baris tanggal di bawahnya." });
  return { rows, errors, warnings, sheetName: sheet.name, extraColumns: [...extras.values()] };
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
