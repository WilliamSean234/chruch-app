import { badRequest, conflict } from "./errors";
import { localParts } from "./time";

export const EVENT_STATUS = ["DRAFT", "PUBLISHED", "CANCELLED"] as const;
export type EventStatus = (typeof EVENT_STATUS)[number];

/** Peralihan status yang diizinkan. Acara batal bisa diaktifkan kembali (kembali ke DRAFT), bila ruangan dan orangnya masih kosong. */
export const EVENT_TRANSITIONS: Record<EventStatus, EventStatus[]> = {
  DRAFT: ["PUBLISHED", "CANCELLED"],
  PUBLISHED: ["DRAFT", "CANCELLED"], // kembali ke DRAFT = ditarik untuk diubah
  CANCELLED: ["DRAFT"],
};

export const canTransition = (from: EventStatus, to: EventStatus) => EVENT_TRANSITIONS[from].includes(to);

export function assertTransition(from: string, to: EventStatus): void {
  if (!(EVENT_STATUS as readonly string[]).includes(from) || !canTransition(from as EventStatus, to)) {
    throw badRequest(`Status acara tidak bisa diubah dari ${from} ke ${to}.`);
  }
}

/** Jadwal hanya boleh diubah saat DRAFT atau PUBLISHED; acara batal dikunci. */
export const isEditable = (status: string) => status === "DRAFT" || status === "PUBLISHED";

/** Tanggal "YYYY-MM-DD" ditambah n bulan; tanggal yang tidak ada di bulan tujuan dipakai hari terakhir bulan itu (31 Okt + 1 bulan = 30 Nov). */
export function addMonthsYmd(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const idx = m - 1 + n;
  const yy = y + Math.floor(idx / 12);
  const mm = ((idx % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return `${yy}-${String(mm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Ibadah dikunci (tidak bisa diubah lagi) setelah lewat 2 bulan dari tanggalnya. */
export const EVENT_LOCK_MONTHS = 2;
/** Kehadiran bisa diisi atau diubah dari tanggal ibadah sampai 1 bulan sesudahnya. */
export const ATTENDANCE_EDIT_MONTHS = 1;

export const isLockedByAge = (startsAt: Date, now: Date = new Date()) => localParts(now).date > addMonthsYmd(localParts(startsAt).date, EVENT_LOCK_MONTHS);
export const LOCKED_MESSAGE = "Ibadah ini sudah lewat 2 bulan, jadi tidak bisa diubah lagi.";
export function assertNotLocked(startsAt: Date, now: Date = new Date()): void {
  if (isLockedByAge(startsAt, now)) throw conflict(LOCKED_MESSAGE);
}

/**
 * Aturan mengisi/mengubah kehadiran. Mengembalikan alasan penolakan, atau null bila boleh.
 * Boleh mulai dari tanggal ibadah (tidak bisa menebak jumlah di masa depan) sampai 1 bulan sesudahnya, baik isi pertama (menyusul) maupun ubah.
 * `hasData` dipertahankan di tanda tangan fungsi untuk pemanggil lama; aturannya sama untuk isi pertama dan ubah.
 */
export function attendanceWriteBlock(startsAt: Date, _hasData: boolean, now: Date = new Date()): string | null {
  const today = localParts(now).date;
  const day = localParts(startsAt).date;
  if (today < day) return "Kehadiran baru bisa diisi pada tanggal ibadah.";
  if (today > addMonthsYmd(day, ATTENDANCE_EDIT_MONTHS)) return "Kehadiran hanya bisa diisi atau diubah sampai 1 bulan setelah ibadah.";
  return null;
}

/** Kehadiran hanya dicatat untuk acara yang sudah PUBLISHED. */
export const acceptsAttendance = (status: string) => status === "PUBLISHED";
