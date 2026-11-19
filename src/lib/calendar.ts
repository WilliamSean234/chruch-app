import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { creatorNames } from "./creators";
import { addMinutes, zonedToUtc } from "./time";
import { can, type AuthUser } from "./rbac";
import { listMeetings } from "./meetings";
import { canSeeMeetingSchedule } from "./groups";

/** Hanya penjadwal yang boleh melihat acara DRAFT; semua orang lain hanya melihat yang sudah diterbitkan. */
export const canSeeDrafts = (u: AuthUser) => can(u, "event.write");

export type CalendarQuery = { from: string; to: string; mine?: boolean; personId?: string; teamTypeId?: string; status?: string };

export async function listCalendar(u: AuthUser, q: CalendarQuery) {
  // Kalender terbuka untuk semua orang yang masuk: siapa pun boleh mencari jadwal seseorang atau sebuah tim.
  // (Acara DRAFT tetap hanya terlihat oleh penjadwal.)
  const personId = q.mine ? (u.personId ?? "none") : q.personId;
  if (q.mine && !u.personId) return { items: [] as never[], rehearsals: [] as never[], meetings: [] as never[], note: "Akun ini belum dihubungkan ke data orang." };

  const drafts = canSeeDrafts(u);
  if (q.status && !drafts && q.status !== "PUBLISHED") return { items: [] as never[], rehearsals: [] as never[], meetings: [] as never[] };

  const assignmentFilter: Prisma.EventAssignmentWhereInput = {
    ...(personId ? { personId } : {}),
    ...(q.teamTypeId ? { teamTypeId: q.teamTypeId } : {}),
  };
  const rows = await prisma.event.findMany({
    where: {
      tenantId: u.tenantId, deletedAt: null, kind: "IBADAH",
      startsAt: { gte: zonedToUtc(q.from, "00:00"), lte: zonedToUtc(q.to, "23:59") },
      status: q.status ?? (drafts ? undefined : "PUBLISHED"),
      ...(Object.keys(assignmentFilter).length ? { assignments: { some: assignmentFilter } } : {}),
    },
    include: { room: true, teams: { include: { teamType: true } }, assignments: { include: { ministry: true } } },
    orderBy: { startsAt: "asc" },
    take: 500,
  });
  const creators = await creatorNames(rows.map((e) => e.createdById));

  // Sesi latihan ikut tampil di kalender (tanggalnya bisa berbeda dari acaranya)
  const rehearsalRows = await prisma.rehearsalSession.findMany({
    where: {
      tenantId: u.tenantId, deletedAt: null,
      startsAt: { gte: zonedToUtc(q.from, "00:00"), lte: zonedToUtc(q.to, "23:59") },
      event: {
        deletedAt: null, kind: "IBADAH", status: q.status ?? (drafts ? { not: "CANCELLED" } : "PUBLISHED"),
        ...(Object.keys(assignmentFilter).length ? { assignments: { some: { ...assignmentFilter, ...(personId ? { rehearsalRequired: true } : {}) } } } : {}),
      },
    },
    include: { room: true, event: { include: { assignments: { select: { personId: true, rehearsalRequired: true } } } } },
    orderBy: { startsAt: "asc" },
    take: 500,
  });

  // Rapat kelompok: tampil untuk Penjadwal, Superadmin, dan anggota kelompok (waktu, ruangan, kelompok; judul disamarkan bagi yang bukan anggota).
  // Pelayan biasa yang bukan anggota kelompok tidak menerima data rapat sama sekali (dicek di listMeetings). Tidak ikut bila kalender difilter per orang/tim,
  // karena itu akan membuka siapa saja anggota sebuah kelompok. "Jadwal saya" hanya memuat rapat kelompok sendiri.
  let meetings: Awaited<ReturnType<typeof listMeetings>> = [];
  const wantsMeetings = !q.teamTypeId && !(q.personId && !q.mine) && (!q.status || q.status === "PUBLISHED");
  if (wantsMeetings) {
    meetings = await listMeetings(u, { from: q.from, to: q.to });
    if (q.mine) meetings = meetings.filter((m) => m.isMember);
  }

  // Daftar kelompok untuk filter "kelompok rapat" di kalender (nama kelompok sudah terlihat di kalender, jadi aman); kosong bila tidak berhak melihat rapat.
  const meetingGroups = (await canSeeMeetingSchedule(u))
    ? await prisma.meetingGroup.findMany({ where: { tenantId: u.tenantId, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } })
    : [];

  return {
    meetings,
    meetingGroups,
    rehearsals: rehearsalRows.map((r) => ({
      id: r.id, eventId: r.eventId, eventTitle: r.event.title, seq: r.seq, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(),
      room: { id: r.room.id, name: r.room.name },
      mine: !!u.personId && r.event.assignments.some((a) => a.personId === u.personId && a.rehearsalRequired),
    })),
    items: rows.map((e) => {
      const myOwn = u.personId ? e.assignments.find((a) => a.personId === u.personId) : undefined;
      return {
        id: e.id, number: e.number, title: e.title, status: e.status, attendanceMode: e.attendanceMode,
        startsAt: e.startsAt.toISOString(), endsAt: e.endsAt.toISOString(), room: { id: e.room.id, name: e.room.name },
        teams: e.teams.map((t) => t.teamType.name),
        seatsTotal: e.assignments.length, seatsFilled: e.assignments.filter((a) => a.personId).length,
        createdBy: (e.createdById && creators.get(e.createdById)) || null,
        mySeat: myOwn ? myOwn.ministry.name : null, // supaya kalender bisa menyorot acara milik pengguna
        // tombol "Isi kehadiran" di detail acara: aturan sama dengan lib/attendance (Penjadwal bebas; lainnya hanya acara yang ditugaskan padanya)
        canAttend: canRecordAttendance(u, e) && (can(u, "event.write") || !!myOwn),
      };
    }),
  };
}

/** Boleh mencatat kehadiran acara ini? Sama dengan aturan di lib/attendance: izin, acara terbit, dan jendela waktunya. */
function canRecordAttendance(u: AuthUser, e: { kind: string; status: string; startsAt: Date; endsAt: Date }) {
  if (!can(u, "attendance.write") || e.kind !== "IBADAH" || e.status !== "PUBLISHED") return false;
  if (can(u, "event.write")) return true;
  const now = Date.now();
  return now >= e.startsAt.getTime() - 3_600_000 && now <= e.endsAt.getTime() + 7 * 24 * 3_600_000;
}

/** "Jadwal saya": tugas dan latihan wajib milik orang yang terhubung ke akun ini. */
export async function mySchedule(u: AuthUser, range: { from?: string; to?: string }) {
  if (!u.personId) return { items: [], note: "Akun ini belum dihubungkan ke data orang." };
  const from = range.from ? zonedToUtc(range.from, "00:00") : new Date();
  const to = range.to ? zonedToUtc(range.to, "23:59") : addMinutes(new Date(), 60 * 24 * 90);
  const seats = await prisma.eventAssignment.findMany({
    where: {
      tenantId: u.tenantId, personId: u.personId,
      event: { deletedAt: null, startsAt: { gte: from, lte: to }, status: canSeeDrafts(u) ? { not: "CANCELLED" } : "PUBLISHED" },
    },
    include: { ministry: true, event: { include: { room: true, rehearsals: { where: { deletedAt: null }, include: { room: true }, orderBy: { seq: "asc" } } } } },
    orderBy: { event: { startsAt: "asc" } },
  });
  return {
    items: seats.map((s) => ({
      eventId: s.eventId, number: s.event.number, title: s.event.title, status: s.event.status,
      startsAt: s.event.startsAt.toISOString(), endsAt: s.event.endsAt.toISOString(), room: s.event.room.name,
      role: s.ministry.name, rehearsalRequired: s.rehearsalRequired,
      attendanceMode: s.event.attendanceMode,
      canAttend: canRecordAttendance(u, s.event),
      rehearsals: s.rehearsalRequired ? s.event.rehearsals.map((r) => ({ seq: r.seq, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), room: r.room.name, note: r.note })) : [],
    })),
  };
}
