/** Helper tampilan (aman dipakai di server maupun klien). */
export const TZ = "Asia/Jakarta";

export const ymd = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
export const hm = (d: Date | string) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(d));
export const dayLong = (d: Date | string) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(d));
export const dayShort = (d: Date | string) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(d));

/** Tanggal 1 sampai tanggal terakhir bulan dari `iso` (YYYY-MM-DD): isian awal semua filter "Dari – Sampai". */
export function monthRange(iso: string) {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

/** Jendela bulan yang dimuat di Jadwal saya: sekian bulan ke belakang dan ke depan dari bulan ini. */
export const MONTHS_BACK = 3;
export const MONTHS_AHEAD = 6;

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
  SUPERADMIN: "Superadmin", PENJADWAL: "Penjadwal", ADMIN_TIM: "Admin Tim", ADMIN_JEMAAT: "Admin Jemaat", PETUGAS_ABSEN: "Petugas Absen", PELAYAN: "Pelayan", PENGAWAS: "Pengawas",
};

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/** "Lantai 4" untuk ruangan berlantai; kosong bila lantainya belum diisi. */
export const floorText = (floor: number | null | undefined) => (floor === null || floor === undefined ? "" : floor === 0 ? "Lantai dasar" : floor < 0 ? `Basement ${-floor}` : `Lantai ${floor}`);

/** Kunci sessionStorage: layar pembuka tampil sekali tiap aplikasi dibuka (satu sesi), tidak di tiap pindah halaman atau muat ulang. */
export const SPLASH_KEY = "splash-seen";
/** Dijalankan di <body> sebelum halaman tampil: bila sesi ini sudah melihat layar pembuka, sembunyikan sejak awal (tanpa berkedip). */
export const SPLASH_GUARD = `try{if(sessionStorage.getItem("${SPLASH_KEY}"))document.documentElement.dataset.splash="off"}catch(e){}`;
