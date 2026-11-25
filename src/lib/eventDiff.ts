/**
 * Perubahan acara untuk Log aktivitas: daftar "dari → ke" yang sudah berupa kata (tanpa ID).
 * Hanya yang benar-benar berubah yang dicatat.
 */
type EventView = { title: string; startsAt: string; endsAt: string; room: { name: string }; attendanceMode: string; theme: string | null; padus: string | null };
export type EventChange = { label: string; from: string | null; to: string | null };

const TZ = "Asia/Jakarta";
const day = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
const time = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)).replace(".", ":");
const minutes = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000);
const MODE: Record<string, string> = { COUNT: "jumlah saja", NAMES: "per nama" };

export function diffEvent(before: EventView, after: EventView): EventChange[] {
  const out: EventChange[] = [];
  const add = (label: string, from: string | null, to: string | null) => { if ((from ?? "") !== (to ?? "")) out.push({ label, from: from || null, to: to || null }); };
  add("Judul", before.title, after.title);
  add("Tanggal", day(before.startsAt), day(after.startsAt));
  add("Jam mulai", time(before.startsAt), time(after.startsAt));
  const d0 = minutes(before.startsAt, before.endsAt), d1 = minutes(after.startsAt, after.endsAt);
  add("Durasi", `${d0} menit`, `${d1} menit`);
  add("Ruangan", before.room.name, after.room.name);
  add("Mode kehadiran", MODE[before.attendanceMode] ?? before.attendanceMode, MODE[after.attendanceMode] ?? after.attendanceMode);
  add("Tema", before.theme, after.theme);
  add("Catatan padus", before.padus, after.padus);
  return out;
}
