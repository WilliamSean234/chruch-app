/** Helper tampilan (aman dipakai di server maupun klien). */
export const TZ = "Asia/Jakarta";

export const ymd = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
export const hm = (d: Date | string) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d));
export const dayLong = (d: Date | string) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(d));
export const dayShort = (d: Date | string) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(d));

export const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const WEEKDAYS = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];

/** Kotak kalender sebulan penuh (mulai Minggu), termasuk hari dari bulan sebelum/sesudahnya. */
export function monthGrid(year: number, month0: number) {
  const first = new Date(Date.UTC(year, month0, 1));
  const dim = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const offset = first.getUTCDay();
  const total = Math.ceil((offset + dim) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(Date.UTC(year, month0, 1 - offset + i));
    return { iso: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === month0, weekday: d.getUTCDay() };
  });
}

export type EventTone = { bg: string; fg: string; dot: string; short: string };

/** Warna per jenis acara (dikenali dari judulnya, jadi acara dinamis tetap punya warna). */
export function toneFor(title: string): EventTone {
  const t = title.toLowerCase();
  const short = title.replace(/^ibadah\s+/i, "");
  if (t.includes("fellowship")) return { bg: "#DDF3EF", fg: "#0B5F57", dot: "#0F766E", short };
  if (t.includes("mandarin")) return { bg: "#FBEFD6", fg: "#6F4304", dot: "#B7791F", short };
  if (t.includes("minggu ii")) return { bg: "#F4E6F5", fg: "#76237F", dot: "#8E2E99", short };
  if (t.includes("minggu i")) return { bg: "#E8E9FA", fg: "#2A2F8F", dot: "#3037A8", short };
  return { bg: "#E9ECF3", fg: "#2F3550", dot: "#5B6285", short };
}
export const REHEARSAL_TONE: EventTone = { bg: "#ECEEF4", fg: "#3A3F58", dot: "#6B7090", short: "Latihan" };

export const STATUS_LABEL: Record<string, { text: string; bg: string; fg: string }> = {
  PUBLISHED: { text: "Terbit", bg: "#E3F3E7", fg: "#1B6B34" },
  DRAFT: { text: "Draf", bg: "#FBEFD6", fg: "#6F4304" },
  CANCELLED: { text: "Dibatalkan", bg: "#FBE4E4", fg: "#9B1C1C" },
};

export const ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: "Superadmin", PENJADWAL: "Penjadwal", ADMIN_TIM: "Admin Tim", PETUGAS_ABSEN: "Petugas Absen", PELAYAN: "Pelayan",
};

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** "Lantai 4" untuk ruangan berlantai; kosong bila lantainya belum diisi. */
export const floorText = (floor: number | null | undefined) => (floor === null || floor === undefined ? "" : floor === 0 ? "Lantai dasar" : floor < 0 ? `Basement ${-floor}` : `Lantai ${floor}`);
