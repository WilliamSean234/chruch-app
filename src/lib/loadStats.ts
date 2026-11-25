/**
 * Bagian murni statistik beban pelayan (tanpa database), supaya mudah diuji: cara menghitung, mengurutkan, menandai beban tinggi,
 * dan memeriksa rentang tanggal. Pengambilan data dari database ada di loadReport.ts.
 *
 * Aturan hitung:
 * - Angka utama = jumlah IBADAH tempat seseorang bertugas. Dua kursi di ibadah yang sama (mis. keyboard dan MC) dihitung satu ibadah,
 *   karena ia hanya datang sekali. Jumlah kursinya tetap ditampilkan terpisah.
 * - Rincian per tim memakai aturan yang sama di dalam tiap tim, jadi jumlah rincian bisa lebih besar dari angka utama
 *   (satu ibadah bisa melibatkan orang yang sama di dua tim).
 */

export type LoadSeat = {
  personId: string;
  personName: string;
  eventId: string;
  /** Waktu mulai ibadah (ISO UTC). */
  at: string;
  teamTypeId: string;
  teamName: string;
  ministryName: string;
};
/** Orang yang mampu melayani di tim yang sedang dilihat; ikut ditampilkan bila belum bertugas di periode ini. */
export type IdlePerson = { id: string; name: string; ministries: string[] };
export type TeamLoad = { teamTypeId: string; team: string; events: number; seats: number };
export type LoadLevel = "BELUM" | "TINGGI" | "WAJAR";
export type LoadRow = {
  personId: string; name: string;
  events: number; seats: number;
  /** Posisi yang paling sering dipegang di periode ini (bagi yang belum bertugas: posisi pertama yang ia bisa). */
  main: string;
  teams: TeamLoad[];
  /** Tanggal ibadah terakhir ia bertugas (di periode ini; bagi yang belum bertugas: sebelum periode, bila ada). */
  last: string | null;
  level: LoadLevel;
};
export type LoadSummary = {
  /** Jumlah orang yang bertugas. */
  serving: number;
  /** Jumlah ibadah berbeda di periode ini (dari kursi yang dihitung). */
  events: number;
  /** Rata-rata ibadah per orang yang bertugas, satu desimal. */
  average: number;
  /** Orang yang mampu melayani tetapi belum bertugas. */
  idle: number;
  /** Orang yang bebannya jauh di atas rata-rata. */
  heavy: number;
  /** Ibadah terbanyak yang dipegang satu orang (untuk skala batang). */
  max: number;
};
export type LoadSort = "beban" | "sedikit" | "nama";

/** Beban tinggi: sedikitnya 3 ibadah dan sedikitnya 1,5 kali rata-rata orang yang bertugas. */
export const HEAVY_MIN = 3;
export const HEAVY_FACTOR = 1.5;
export const isHeavy = (events: number, average: number): boolean => events >= HEAVY_MIN && events >= average * HEAVY_FACTOR;

const byName = (a: string, b: string) => a.localeCompare(b, "id");
const round1 = (n: number) => Math.round(n * 10) / 10;

type Acc = {
  name: string; events: Set<string>; seats: number; last: string;
  teams: Map<string, { team: string; events: Set<string>; seats: number }>;
  ministries: Map<string, number>;
};

/** Posisi yang paling sering muncul; bila sama banyak, yang urutan hurufnya lebih awal. */
function mostOften(counts: Map<string, number>): string {
  let best = ""; let n = 0;
  for (const [k, c] of counts) if (c > n || (c === n && byName(k, best) < 0)) { best = k; n = c; }
  return best;
}

export function sortLoad(rows: LoadRow[], sort: LoadSort): LoadRow[] {
  const out = [...rows];
  if (sort === "nama") return out.sort((a, b) => byName(a.name, b.name));
  if (sort === "sedikit") return out.sort((a, b) => a.events - b.events || a.seats - b.seats || byName(a.name, b.name));
  return out.sort((a, b) => b.events - a.events || b.seats - a.seats || byName(a.name, b.name));
}

/**
 * Susun daftar beban dari kursi yang sudah diisi. `idle` = calon yang bisa melayani; yang ternyata sudah bertugas dilewati.
 * `lastBefore` = tanggal terakhir bertugas sebelum periode (hanya dipakai untuk yang belum bertugas).
 */
export function buildLoad(seats: LoadSeat[], idle: IdlePerson[], lastBefore: ReadonlyMap<string, string> = new Map(), sort: LoadSort = "beban"): { rows: LoadRow[]; summary: LoadSummary } {
  const by = new Map<string, Acc>();
  for (const s of seats) {
    let a = by.get(s.personId);
    if (!a) { a = { name: s.personName, events: new Set(), seats: 0, last: "", teams: new Map(), ministries: new Map() }; by.set(s.personId, a); }
    a.events.add(s.eventId);
    a.seats += 1;
    if (s.at > a.last) a.last = s.at;
    let t = a.teams.get(s.teamTypeId);
    if (!t) { t = { team: s.teamName, events: new Set(), seats: 0 }; a.teams.set(s.teamTypeId, t); }
    t.events.add(s.eventId);
    t.seats += 1;
    a.ministries.set(s.ministryName, (a.ministries.get(s.ministryName) ?? 0) + 1);
  }

  let sum = 0;
  for (const a of by.values()) sum += a.events.size;
  const average = by.size ? sum / by.size : 0;

  const rows: LoadRow[] = [];
  for (const [id, a] of by) {
    const events = a.events.size;
    rows.push({
      personId: id, name: a.name, events, seats: a.seats, main: mostOften(a.ministries),
      teams: [...a.teams].map(([teamTypeId, t]) => ({ teamTypeId, team: t.team, events: t.events.size, seats: t.seats })).sort((x, y) => y.events - x.events || byName(x.team, y.team)),
      last: a.last || null,
      level: isHeavy(events, average) ? "TINGGI" : "WAJAR",
    });
  }
  const heavy = rows.filter((r) => r.level === "TINGGI").length;
  const idleRows: LoadRow[] = idle
    .filter((p) => !by.has(p.id))
    .map((p) => ({ personId: p.id, name: p.name, events: 0, seats: 0, main: p.ministries[0] ?? "", teams: [], last: lastBefore.get(p.id) ?? null, level: "BELUM" as const }));

  const all = sortLoad([...rows, ...idleRows], sort);
  return {
    rows: all,
    summary: {
      serving: by.size,
      events: new Set(seats.map((s) => s.eventId)).size,
      average: round1(average),
      idle: idleRows.length,
      heavy,
      max: rows.reduce((m, r) => Math.max(m, r.events), 0),
    },
  };
}

/** "Musik 4, EBM 2": rincian per tim dalam satu baris teks. */
export const teamsText = (teams: readonly TeamLoad[]): string => teams.map((t) => `${t.team} ${t.events}`).join(", ");

// ───────────────────────── Rentang tanggal ─────────────────────────

export const MAX_RANGE_DAYS = 366;

function parseDay(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? t : null;
}

/** Pesan galat untuk rentang yang tidak boleh dipakai; null bila boleh. Tanggal berbentuk YYYY-MM-DD. */
export function rangeError(from: string, to: string): string | null {
  const a = parseDay(from), b = parseDay(to);
  if (a === null || b === null) return "Tanggal tidak valid.";
  if (a > b) return "Tanggal awal tidak boleh setelah tanggal akhir.";
  if ((b - a) / 86_400_000 + 1 > MAX_RANGE_DAYS) return "Rentang paling lama 12 bulan.";
  return null;
}

/** Nama berkas unduhan: satu bulan penuh memakai "YYYY-MM", selain itu tanggal awal dan akhirnya. */
export function loadFileName(from: string, to: string): string {
  const a = parseDay(from), b = parseDay(to);
  if (a !== null && b !== null) {
    const f = new Date(a), l = new Date(b);
    const fullMonth = f.getUTCDate() === 1 && l.getUTCMonth() === f.getUTCMonth() && l.getUTCFullYear() === f.getUTCFullYear()
      && new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + 1, 0)).getUTCDate() === l.getUTCDate();
    if (fullMonth) return `BEBAN_PELAYAN_${from.slice(0, 7)}.xlsx`;
  }
  return `BEBAN_PELAYAN_${from}_${to}.xlsx`;
}
