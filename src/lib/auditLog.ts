import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { forbidden } from "./errors";
import { can, type AuthUser } from "./rbac";
import { creatorNames } from "./creators";
import { addMinutes, DATE_RE, localParts, zonedToUtc } from "./time";
import { auditYears } from "./years";
import { buildEventOptions, eventIdsOf, isOwnEdit } from "./auditEvents";
import { describe, eventName, fmtDay, fmtTime, loadRefs, loadRoleLabels, wantedOf } from "./auditDescribe";
import { pageOf, pagingQuery, resolvePaging } from "./paging";

/**
 * Log aktivitas: kapan, siapa, apa, dan bagaimana. Dibuka Superadmin dan Pengawas; tanpa ID, hanya nama.
 * Isi rapat tetap rahasia: judul, nama peserta, tautan, dan isi notulen tidak pernah ditampilkan di sini (lihat auditDescribe.ts).
 */
export const CATEGORIES: { key: string; label: string; prefixes: string[] }[] = [
  { key: "event", label: "Jadwal acara", prefixes: ["event.", "rehearsal.", "template.", "assignment.", "swap."] },
  { key: "meeting", label: "Rapat", prefixes: ["meeting."] },
  { key: "group", label: "Kelompok rapat", prefixes: ["group."] },
  { key: "person", label: "Orang dan pelayanan", prefixes: ["person.", "ministry.", "team.", "cg.", "positions.", "communities.", "cg-groups."] },
  { key: "account", label: "Akun", prefixes: ["user.", "registration."] },
  { key: "booking", label: "Ruangan dan bentrok", prefixes: ["booking.", "rooms."] },
  { key: "attendance", label: "Kehadiran ibadah", prefixes: ["attendance."] },
  { key: "import", label: "Impor data", prefixes: ["import."] },
  { key: "church", label: "Profil gereja dan cadangan", prefixes: ["church.", "backup."] },
  { key: "report", label: "Laporan", prefixes: ["report."] },
];

const LABELS: Record<string, string> = {
  "assignment.set": "Mengatur petugas", "swap.request": "Meminta pengganti", "swap.cancel": "Membatalkan permintaan pengganti", "swap.reject": "Menolak permintaan pengganti", "assignment.copy": "Menyalin personel antar acara", "assignment.upload": "Mengunggah jadwal tim", "person.alias": "Menyimpan ejaan nama jadwal", "attendance.guest": "Mencatat tamu ibadah", "attendance.batch": "Mencatat kehadiran ibadah per nama", "attendance.summary": "Mencatat jumlah kehadiran", "booking.override": "Menimpa bentrok jadwal",
  "cg.leaders": "Mengatur pemimpin CG", "person.ministries": "Mengubah pelayanan orang", "event.notify": "Memberi tahu pelayan",
  "positions.create": "Menambah posisi orang", "positions.update": "Mengubah posisi orang", "positions.delete": "Menghapus posisi orang",
  "communities.create": "Menambah komunitas", "communities.update": "Mengubah komunitas", "communities.delete": "Menghapus komunitas",
  "cg-groups.create": "Menambah kelompok CG", "cg-groups.update": "Mengubah kelompok CG", "cg-groups.delete": "Menghapus kelompok CG",
  "rooms.create": "Menambah ruangan", "rooms.update": "Mengubah ruangan", "rooms.delete": "Menghapus ruangan",
  "event.cancel": "Membatalkan acara", "event.reopen": "Mengaktifkan kembali acara", "event.band-mode": "Mengubah Band / No Band", "event.create": "Membuat acara", "event.publish": "Menerbitkan acara", "event.unpublish": "Menarik acara dari terbit", "event.update": "Mengubah acara",
  "event.seat.add": "Menambah posisi acara", "event.seat.remove": "Menghapus posisi acara", "event.team.add": "Menambah tim ke acara", "event.team.remove": "Menghapus tim dari acara",
  "group.create": "Membuat kelompok", "group.update": "Mengubah kelompok", "group.delete": "Menghapus kelompok",
  "group.member.add": "Menambah anggota kelompok", "group.member.remove": "Mengeluarkan anggota kelompok", "group.member.leave": "Keluar dari kelompok", "group.member.positions": "Mengubah jabatan anggota",
  "group.position.create": "Membuat jabatan", "group.position.update": "Mengubah jabatan", "group.position.delete": "Menghapus jabatan",
  "import.apply": "Mengimpor data", "backup.download": "Mengunduh cadangan data", "report.load.download": "Mengunduh statistik beban pelayan", "church.profile.update": "Mengubah profil gereja",
  "meeting.create": "Membuat rapat", "meeting.series.create": "Membuat rapat berulang", "meeting.update": "Mengubah jadwal rapat", "meeting.cancel": "Membatalkan rapat",
  "meeting.changes": "Menyimpan perubahan kehadiran dan lampiran", "meeting.link.add": "Menambah tautan lampiran", "meeting.link.remove": "Menghapus tautan lampiran",
  "meeting.minutes.create": "Membuat notulen", "meeting.minutes.save": "Menyimpan draf notulen", "meeting.minutes.finalize": "Memfinalkan notulen", "meeting.minutes.revise": "Membuka revisi notulen",
  "meeting.participant.add": "Menambah peserta rapat", "meeting.participant.attend": "Mencatat kehadiran rapat", "meeting.participant.bulk": "Menandai kehadiran rapat sekaligus", "meeting.participant.remove": "Menghapus peserta rapat",
  "ministry.create": "Membuat posisi pelayanan", "ministry.update": "Mengubah posisi pelayanan", "ministry.delete": "Menghapus posisi pelayanan",
  "person.create": "Menambah orang", "person.update": "Mengubah data orang", "person.delete": "Menghapus orang",
  "rehearsal.create": "Membuat sesi latihan", "rehearsal.update": "Mengubah sesi latihan", "rehearsal.delete": "Menghapus sesi latihan", "rehearsal.required": "Mengatur latihan wajib", "rehearsal.required.bulk": "Mengatur latihan wajib sekaligus",
  "team.create": "Membuat tim", "team.update": "Mengubah tim", "team.delete": "Menghapus tim",
  "template.create": "Membuat template", "template.update": "Mengubah template", "template.delete": "Menghapus template", "template.generate": "Membuat jadwal dari template",
  "registration.submit": "Permintaan daftar akun masuk", "registration.approve": "Menyetujui permintaan daftar", "registration.reject": "Menolak permintaan daftar",
  "user.create": "Membuat akun", "user.update": "Mengubah akun", "user.deactivate": "Menonaktifkan akun", "user.password.change": "Mengganti kata sandi",
};
export const actionLabel = (a: string) => LABELS[a] ?? a;

export const auditQuery = z.object({
  ...pagingQuery,
  search: z.string().trim().max(80).optional(),
  category: z.string().max(20).optional(),
  userId: z.string().uuid().optional(),
  eventId: z.string().refine((v) => { const ids = eventIdsOf(v); return ids.length >= 1 && ids.length <= 2 && ids.every((x) => z.string().uuid().safeParse(x).success); }, "Acara tidak valid.").optional(), // satu acara, atau dua id dipisah koma (Ibadah Minggu I dan II)
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
});

/**
 * Acara yang punya aktivitas pada rentang waktu log (untuk pilihan saringan "Acara").
 * Kursi dan sesi latihan ditelusuri ke acaranya. Rapat ditulis dengan nama kelompok, bukan judulnya.
 * Ibadah Minggu I dan II di hari yang sama selalu digabung menjadi satu pilihan; tiap ibadah tetap bisa disaring di dalamnya (lihat auditEvents.ts).
 */
async function eventOptions(tenantId: string, createdAt: Prisma.AuditLogWhereInput["createdAt"]) {
  const logs = await prisma.auditLog.findMany({
    where: { tenantId, ...(createdAt ? { createdAt } : {}), entity: { in: ["Event", "EventAssignment", "RehearsalSession"] } },
    select: { action: true, entity: true, entityId: true, payload: true }, take: 5000,
  });
  const ids = new Set(logs.filter((l) => l.entity === "Event").map((l) => l.entityId));
  const seatIds = logs.filter((l) => l.entity === "EventAssignment").map((l) => l.entityId);
  const rehIds = logs.filter((l) => l.entity === "RehearsalSession").map((l) => l.entityId);
  const [seats, rehs] = await Promise.all([
    seatIds.length ? prisma.eventAssignment.findMany({ where: { id: { in: seatIds }, tenantId }, select: { id: true, eventId: true } }) : [],
    rehIds.length ? prisma.rehearsalSession.findMany({ where: { id: { in: rehIds }, tenantId }, select: { eventId: true } }) : [],
  ]);
  for (const s of seats) ids.add(s.eventId);
  for (const r of rehs) ids.add(r.eventId);
  if (!ids.size) return [];

  const seatEvent = new Map(seats.map((s) => [s.id, s.eventId]));
  const solo = new Set<string>(); // acara yang pernah diubah sendiri
  for (const l of logs) {
    if (!isOwnEdit(l.action, l.payload)) continue;
    const eid = l.entity === "Event" ? l.entityId : l.entity === "EventAssignment" ? seatEvent.get(l.entityId) : undefined;
    if (eid) solo.add(eid);
  }

  const events = await prisma.event.findMany({
    where: { id: { in: [...ids] }, tenantId },
    select: { id: true, kind: true, title: true, startsAt: true, group: { select: { name: true } }, template: { select: { name: true } } },
    orderBy: { startsAt: "desc" }, take: 300,
  });
  const byId = new Map(events.map((e) => [e.id, e]));
  return buildEventOptions(
    events.map((e) => ({ id: e.id, startsAt: e.startsAt, title: e.title, templateName: e.kind === "IBADAH" ? e.template?.name ?? null : null })),
    solo,
    {
      label: (x) => { const e = byId.get(x.id)!; return `${e.kind === "RAPAT" ? `Rapat ${e.group?.name ?? ""}`.trim() : e.title} · ${fmtDay(e.startsAt)}`; },
      labelTime: (x) => { const e = byId.get(x.id)!; return eventName({ kind: e.kind, title: e.title, startsAt: e.startsAt, group: e.group?.name ?? null }); },
      part: (x) => `${x.title} · ${fmtTime(x.startsAt)}`,
      group: (x) => { const e = byId.get(x.id)!; return e.kind === "RAPAT" ? `Rapat ${e.group?.name ?? ""}`.trim() : e.title; },
      day: (x) => fmtDay(x.startsAt),
      dayKey: (x) => localParts(x.startsAt).date,
    },
  );
}

/** Catatan yang menyangkut satu acara (atau Ibadah Minggu I dan II sekaligus): acaranya sendiri, kursi dan sesi latihannya, serta catatan yang menyebut acara itu di isinya. */
async function eventFilter(tenantId: string, eventIds: string[]): Promise<Prisma.AuditLogWhereInput> {
  const [seats, rehs] = await Promise.all([
    prisma.eventAssignment.findMany({ where: { eventId: { in: eventIds }, tenantId }, select: { id: true } }),
    prisma.rehearsalSession.findMany({ where: { eventId: { in: eventIds }, tenantId }, select: { id: true } }),
  ]);
  return {
    OR: [
      { entity: { in: ["Event", "EventAssignment", "RehearsalSession"] }, entityId: { in: [...eventIds, ...seats.map((s) => s.id), ...rehs.map((r) => r.id)] } },
      ...eventIds.flatMap((id) => [
        { payload: { path: ["eventId"], equals: id } },
        { payload: { path: ["sourceEventId"], equals: id } },
        { payload: { path: ["events"], array_contains: [id] } },
      ]),
    ],
  };
}

export async function listAuditLogs(u: AuthUser, q: z.infer<typeof auditQuery>) {
  if (!can(u, "audit.read")) throw forbidden("Log aktivitas hanya untuk Superadmin dan Pengawas.");
  const pg = resolvePaging(q);
  const cat = CATEGORIES.find((c) => c.key === q.category);
  const createdAt = q.from || q.to ? { ...(q.from ? { gte: zonedToUtc(q.from, "00:00") } : {}), ...(q.to ? { lt: addMinutes(zonedToUtc(q.to, "00:00"), 24 * 60) } : {}) } : undefined;
  const and: Prisma.AuditLogWhereInput[] = [];
  const where: Prisma.AuditLogWhereInput = {
    tenantId: u.tenantId,
    ...(q.userId ? { userId: q.userId } : {}),
    ...(cat ? { OR: cat.prefixes.map((p) => ({ action: { startsWith: p } })) } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
  if (q.eventId) and.push(await eventFilter(u.tenantId, eventIdsOf(q.eventId)));
  if (q.search) {
    const needle = q.search.toLowerCase();
    const matching = Object.entries(LABELS).filter(([k, v]) => v.toLowerCase().includes(needle) || k.includes(needle)).map(([k]) => k);
    and.push({ OR: [{ action: { in: matching } }, { action: { contains: needle, mode: "insensitive" } }, { reason: { contains: q.search, mode: "insensitive" } }] });
  }
  if (and.length) where.AND = and;
  const [total, rows, actors, years, events] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: pg.skip, take: pg.take }),
    prisma.auditLog.findMany({ where: { tenantId: u.tenantId, userId: { not: null } }, distinct: ["userId"], select: { userId: true }, take: 200 }),
    auditYears(u.tenantId),
    eventOptions(u.tenantId, createdAt),
  ]);
  const [names, roles, refs] = await Promise.all([
    creatorNames([...rows.map((r) => r.userId), ...actors.map((a) => a.userId)]),
    loadRoleLabels(rows.map((r) => r.userId).filter((x): x is string => !!x)),
    loadRefs(u.tenantId, wantedOf(rows)),
  ]);
  const items = rows.map((r) => {
    const d = describe(r, refs);
    return {
      id: r.id, at: r.createdAt.toISOString(), user: r.userId ? names.get(r.userId) ?? "Pengguna dihapus" : "Sistem",
      role: r.userId ? roles.get(r.userId) ?? null : null,
      action: r.action, label: actionLabel(r.action), target: d.target, how: d.how, reason: r.reason,
    };
  });
  const users = actors.map((a) => ({ id: a.userId as string, name: names.get(a.userId as string) ?? "Pengguna dihapus" })).sort((x, y) => x.name.localeCompare(y.name));
  return { ...pageOf(items, total, pg), options: { categories: CATEGORIES.map((c) => ({ key: c.key, label: c.label })), users, years, events } };
}
