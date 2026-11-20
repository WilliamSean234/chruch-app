import { badRequest } from "./errors";

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

/** Kehadiran hanya dicatat untuk acara yang sudah PUBLISHED. */
export const acceptsAttendance = (status: string) => status === "PUBLISHED";
