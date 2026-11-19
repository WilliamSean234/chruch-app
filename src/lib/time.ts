const tzDefault = () => process.env.APP_TIMEZONE ?? "Asia/Jakarta";

function tzOffsetMs(at: Date, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** "2026-11-29" + "09:30" di zona waktu gereja → instan UTC. */
export function zonedToUtc(date: string, time: string, tz = tzDefault()): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = tzOffsetMs(new Date(guess), tz);
  let t = guess - off1;
  const off2 = tzOffsetMs(new Date(t), tz);
  if (off2 !== off1) t = guess - off2;
  return new Date(t);
}

/** Tanggal dan jam lokal (zona gereja) dari sebuah instan. */
export function localParts(at: Date, tz = tzDefault()): { date: string; time: string } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(at);
  return { date, time };
}

export const addMinutes = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Semua tanggal kalender dari `from` sampai `to` (inklusif), sebagai tanggal murni (tanpa zona waktu). */
export function* eachDate(from: string, to: string) {
  const start = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const end = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t);
    const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    yield { iso: d.toISOString().slice(0, 10), weekday: d.getUTCDay(), dom: d.getUTCDate(), dim };
  }
}

/** Apakah tanggal ini jatuh pada pola template? ordinal 1..4 = ke-n dalam bulan, 5 = yang terakhir. */
export function matchesPattern(
  t: { weekday: number; recurrence: string; ordinal: number | null },
  d: { weekday: number; dom: number; dim: number },
): boolean {
  if (d.weekday !== t.weekday) return false;
  if (t.recurrence === "WEEKLY") return true;
  if (t.ordinal === 5) return d.dom + 7 > d.dim;
  return t.ordinal !== null && Math.ceil(d.dom / 7) === t.ordinal;
}
