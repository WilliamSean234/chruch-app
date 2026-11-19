/** Pengulangan rapat: menghitung tanggal-tanggal dan teks penjelasnya. Murni tanggal kalender (tanpa zona waktu), aman dipakai di browser dan server. */
export const PATTERNS = ["WEEKLY", "BIWEEKLY", "MONTHLY_NTH"] as const;
export type Pattern = (typeof PATTERNS)[number];
export const MAX_OCCURRENCES = 26;
export const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

const parse = (d: string) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)));
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** Hari dan minggu ke-berapa dalam bulan untuk tanggal pertama. Minggu ke-5 dianggap "terakhir". */
export function describeFirst(date: string) {
  const d = parse(date);
  return { weekday: d.getUTCDay(), ordinal: Math.min(5, Math.ceil(d.getUTCDate() / 7)) };
}

function nthWeekday(y: number, m: number, weekday: number, ordinal: number): number {
  if (ordinal >= 5) {
    const last = daysIn(y, m);
    const lastDow = new Date(Date.UTC(y, m, last)).getUTCDay();
    return last - ((lastDow - weekday + 7) % 7);
  }
  const firstDow = new Date(Date.UTC(y, m, 1)).getUTCDay();
  return 1 + ((weekday - firstDow + 7) % 7) + (ordinal - 1) * 7;
}

export function patternText(pattern: Pattern, weekday: number, ordinal: number | null): string {
  const day = DAY_NAMES[weekday] ?? "";
  if (pattern === "WEEKLY") return `Tiap minggu, hari ${day}`;
  if (pattern === "BIWEEKLY") return `Tiap 2 minggu, hari ${day}`;
  return `${day} ${ordinal === 5 ? "terakhir" : `ke-${ordinal}`} tiap bulan`;
}

/** Tanggal pertama selalu ikut. Berhenti setelah `count` tanggal atau lewat `until`, dan paling banyak MAX_OCCURRENCES. */
export function expandDates(first: string, pattern: Pattern, end: { count?: number; until?: string }): { dates: string[]; capped: boolean } {
  const limit = Math.min(end.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const dates = [first];
  let capped = false;
  const stop = (d: string) => !!end.until && d > end.until;
  if (pattern === "MONTHLY_NTH") {
    const { weekday, ordinal } = describeFirst(first);
    const d0 = parse(first);
    for (let i = 1; i < 200 && dates.length < limit; i++) {
      const y = d0.getUTCFullYear() + Math.floor((d0.getUTCMonth() + i) / 12);
      const m = (d0.getUTCMonth() + i) % 12;
      const date = fmt(new Date(Date.UTC(y, m, nthWeekday(y, m, weekday, ordinal))));
      if (stop(date)) return { dates, capped };
      dates.push(date);
    }
  } else {
    const step = pattern === "BIWEEKLY" ? 14 : 7;
    for (let t = parse(first).getTime() + step * 86_400_000; dates.length < limit; t += step * 86_400_000) {
      const date = fmt(new Date(t));
      if (stop(date)) return { dates, capped };
      dates.push(date);
    }
  }
  capped = !end.count && !!end.until && dates.length >= MAX_OCCURRENCES; // masih ada tanggal sebelum batas, tapi dipotong
  return { dates, capped };
}
