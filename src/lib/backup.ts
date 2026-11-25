import { prisma } from "./prisma";
import { forbidden } from "./errors";
import { isSuperadmin, type AuthUser } from "./rbac";
import { buildXlsx, type XSheetSpec } from "./xlsxWrite";
import { ROLE_LABEL } from "./ui";
import { BACKUP_MONTHS_BACK, backupFileName, backupFrom, birthText, dateText, joinNames, noteSheet, sheetName, tableSheet, timeText, type BackupCell } from "./backupSheets";

const WEEKDAY = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const yn = (b: boolean) => (b ? "Ya" : "Tidak");
const CAP = 50_000; // pengaman: tidak ada satu tabel pun yang dibaca tanpa batas

/**
 * Cadangan data gereja dalam satu berkas Excel, untuk Superadmin. Dibuat saat diminta dan tidak disimpan di server.
 * Yang TIDAK dimasukkan, dengan sengaja: isi rapat dan notulen (terenkripsi supaya Superadmin pun tidak membacanya) dan daftar
 * anggota kelompok rapat (milik kelompok itu); kata sandi dan token; perangkat notifikasi; tautan ibadah online; kunci enkripsi.
 */
export async function buildBackup(u: AuthUser, now = new Date()) {
  if (!isSuperadmin(u)) throw forbidden("Hanya Superadmin yang boleh mengunduh cadangan.");
  const t = u.tenantId;
  const from = backupFrom(now);
  const eventWhere = { tenantId: t, deletedAt: null, kind: "IBADAH", startsAt: { gte: from } } as const;

  const [tenant, people, ministries, rooms, cgs, groups, memberCounts, templates, events, seats, rehearsals, users] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: t }, select: { name: true } }),
    prisma.person.findMany({
      where: { tenantId: t, deletedAt: null }, orderBy: { name: "asc" }, take: CAP,
      select: {
        name: true, title: true, nickname: true, birthDate: true, gender: true, origin: true, originChurch: true, cgGroupId: true,
        position: { select: { name: true } }, cgGroup: { select: { name: true } },
        communities: { select: { community: { select: { name: true } } } },
        ministries: { select: { ministry: { select: { name: true, deletedAt: true, teamType: { select: { name: true } } } } } },
        user: { select: { id: true } },
      },
    }),
    prisma.ministry.findMany({ where: { tenantId: t, deletedAt: null, teamType: { deletedAt: null } }, orderBy: [{ teamType: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }], take: CAP, select: { name: true, rehearsalRequiredDefault: true, bandOnly: true, teamType: { select: { name: true } } } }),
    prisma.room.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: [{ floor: "asc" }, { name: "asc" }], take: CAP, select: { name: true, floor: true, isActive: true, isOnline: true } }),
    prisma.cgGroup.findMany({ where: { tenantId: t, deletedAt: null }, orderBy: { name: "asc" }, take: CAP, select: { id: true, name: true, leaders: { select: { person: { select: { name: true } } } } } }),
    prisma.meetingGroup.findMany({
      where: { tenantId: t, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: CAP,
      select: { id: true, name: true, quorumMin: true, positions: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { name: true, seats: true, canSchedule: true, canWriteMinutes: true, canFinalize: true, canManageMembers: true } } },
    }),
    prisma.groupMember.groupBy({ by: ["groupId"], where: { leftAt: null, group: { tenantId: t, deletedAt: null } }, _count: { _all: true } }),
    prisma.eventTemplate.findMany({
      where: { tenantId: t, deletedAt: null }, orderBy: { name: "asc" }, take: CAP,
      select: { name: true, weekday: true, recurrence: true, ordinal: true, startTime: true, durationMin: true, attendanceModeDefault: true, isOnline: true, room: { select: { name: true } }, slots: { select: { slotNo: true, ministry: { select: { name: true } } } } },
    }),
    prisma.event.findMany({
      where: eventWhere, orderBy: { startsAt: "asc" }, take: CAP,
      select: {
        number: true, title: true, startsAt: true, endsAt: true, status: true, bandMode: true, attendanceMode: true, theme: true, padus: true, cancelReason: true, isOnline: true,
        room: { select: { name: true } }, template: { select: { name: true } }, attendanceSummary: { select: { total: true } }, _count: { select: { attendances: true } },
      },
    }),
    prisma.eventAssignment.findMany({
      where: { tenantId: t, event: eventWhere }, orderBy: [{ event: { startsAt: "asc" } }, { sortOrder: "asc" }], take: CAP,
      select: { slotNo: true, rehearsalRequired: true, event: { select: { number: true, title: true, startsAt: true } }, ministry: { select: { name: true, teamType: { select: { name: true } } } }, person: { select: { name: true } } },
    }),
    prisma.rehearsalSession.findMany({
      where: { tenantId: t, deletedAt: null, event: eventWhere }, orderBy: [{ startsAt: "asc" }], take: CAP,
      select: { seq: true, startsAt: true, endsAt: true, note: true, room: { select: { name: true } }, event: { select: { number: true, title: true } } },
    }),
    prisma.user.findMany({
      where: { tenantId: t, deletedAt: null }, orderBy: { email: "asc" }, take: CAP,
      select: { email: true, isActive: true, emailVerifiedAt: true, person: { select: { name: true } }, roles: { select: { role: { select: { code: true, name: true } }, teamType: { select: { name: true } } } } },
    }),
  ]);

  const members = new Map(memberCounts.map((m) => [m.groupId, m._count._all]));
  const cgCount = new Map<string, number>();
  for (const p of people) if (p.cgGroupId) cgCount.set(p.cgGroupId, (cgCount.get(p.cgGroupId) ?? 0) + 1);

  const used = new Set<string>();
  const data: { sheet: XSheetSpec; rows: number }[] = [];
  const add = (name: string, cols: { head: string; width: number }[], rows: BackupCell[][]) => {
    data.push({ sheet: tableSheet(sheetName(name, used), cols, rows), rows: rows.length });
  };
  const guide = sheetName("Petunjuk", used); // diisi belakangan, tetapi menjadi lembar pertama

  add("Orang", [{ head: "Nama", width: 28 }, { head: "Gelar", width: 8 }, { head: "Panggilan", width: 14 }, { head: "Tanggal lahir", width: 13 }, { head: "L/P", width: 6 }, { head: "Posisi", width: 16 }, { head: "Kelompok CG", width: 18 }, { head: "Asal", width: 9 }, { head: "Gereja asal", width: 20 }, { head: "Komunitas", width: 22 }, { head: "Pelayanan", width: 44 }, { head: "Punya akun", width: 11 }],
    people.map((p) => [p.name, p.title, p.nickname, birthText(p.birthDate), p.gender, p.position.name, p.cgGroup?.name, p.origin === "LUAR" ? "Luar" : "Dalam", p.originChurch, joinNames(p.communities.map((c) => c.community.name)), joinNames(p.ministries.filter((m) => !m.ministry.deletedAt).map((m) => `${m.ministry.teamType.name}: ${m.ministry.name}`)), yn(!!p.user)]));
  add("Tim dan posisi", [{ head: "Tim", width: 24 }, { head: "Posisi", width: 24 }, { head: "Latihan wajib bawaan", width: 20 }, { head: "Khusus band", width: 12 }],
    ministries.map((m) => [m.teamType.name, m.name, yn(m.rehearsalRequiredDefault), yn(m.bandOnly)]));
  add("Ruangan", [{ head: "Ruangan", width: 18 }, { head: "Lantai", width: 8 }, { head: "Aktif", width: 8 }, { head: "Ruangan online", width: 15 }],
    rooms.map((r) => [r.name, r.floor, yn(r.isActive), yn(r.isOnline)]));
  add("Kelompok CG", [{ head: "Kelompok CG", width: 24 }, { head: "Pemimpin", width: 40 }, { head: "Jumlah anggota", width: 15 }],
    cgs.map((c) => [c.name, joinNames(c.leaders.map((l) => l.person.name)), cgCount.get(c.id) ?? 0]));
  add("Kelompok rapat", [{ head: "Kelompok", width: 24 }, { head: "Kuorum (%)", width: 11 }, { head: "Jabatan", width: 22 }, { head: "Jumlah orang", width: 13 }, { head: "Boleh menjadwalkan", width: 18 }, { head: "Boleh menulis notulen", width: 20 }, { head: "Boleh memfinalkan", width: 17 }, { head: "Boleh mengelola anggota", width: 22 }, { head: "Anggota aktif", width: 14 }],
    groups.flatMap((g) => (g.positions.length ? g.positions : [null]).map((p) => [g.name, g.quorumMin, p?.name, p?.seats ?? (p ? "Tanpa batas" : null), p ? yn(p.canSchedule) : null, p ? yn(p.canWriteMinutes) : null, p ? yn(p.canFinalize) : null, p ? yn(p.canManageMembers) : null, members.get(g.id) ?? 0])));
  add("Template acara", [{ head: "Template", width: 26 }, { head: "Hari", width: 9 }, { head: "Berulang", width: 14 }, { head: "Mulai", width: 8 }, { head: "Durasi (menit)", width: 14 }, { head: "Ruangan", width: 14 }, { head: "Kehadiran", width: 12 }, { head: "Online", width: 8 }, { head: "Posisi", width: 60 }],
    templates.map((x) => [x.name, WEEKDAY[x.weekday] ?? "", x.recurrence === "MONTHLY_NTH" ? (x.ordinal === 5 ? "Tiap bulan, yang terakhir" : `Tiap bulan, ke-${x.ordinal}`) : "Tiap minggu", x.startTime, x.durationMin, x.room.name, x.attendanceModeDefault === "NAMES" ? "Per nama" : "Jumlah", yn(x.isOnline), joinNames(x.slots.map((s) => (s.slotNo > 1 ? `${s.ministry.name} ${s.slotNo}` : s.ministry.name)))]));
  add("Acara", [{ head: "Nomor", width: 16 }, { head: "Acara", width: 28 }, { head: "Tanggal", width: 12 }, { head: "Mulai", width: 8 }, { head: "Selesai", width: 8 }, { head: "Ruangan", width: 14 }, { head: "Status", width: 12 }, { head: "Band", width: 10 }, { head: "Kehadiran", width: 11 }, { head: "Tema", width: 30 }, { head: "Padus", width: 24 }, { head: "Alasan batal", width: 26 }, { head: "Online", width: 8 }, { head: "Template", width: 22 }],
    events.map((e) => [e.number, e.title, dateText(e.startsAt), timeText(e.startsAt), timeText(e.endsAt), e.room.name, e.status === "PUBLISHED" ? "Terbit" : e.status === "CANCELLED" ? "Batal" : "Draf", e.bandMode === "NO_BAND" ? "No Band" : "Band", e.attendanceMode === "NAMES" ? e._count.attendances : e.attendanceSummary?.total ?? null, e.theme, e.padus, e.cancelReason, yn(e.isOnline), e.template?.name]));
  add("Petugas", [{ head: "Nomor acara", width: 16 }, { head: "Acara", width: 28 }, { head: "Tanggal", width: 12 }, { head: "Tim", width: 22 }, { head: "Posisi", width: 22 }, { head: "Urutan", width: 8 }, { head: "Petugas", width: 28 }, { head: "Latihan wajib", width: 13 }],
    seats.map((s) => [s.event.number, s.event.title, dateText(s.event.startsAt), s.ministry.teamType.name, s.ministry.name, s.slotNo, s.person?.name, yn(s.rehearsalRequired)]));
  add("Latihan", [{ head: "Nomor acara", width: 16 }, { head: "Acara", width: 28 }, { head: "Latihan ke", width: 11 }, { head: "Tanggal", width: 12 }, { head: "Mulai", width: 8 }, { head: "Selesai", width: 8 }, { head: "Ruangan", width: 14 }, { head: "Catatan", width: 30 }],
    rehearsals.map((r) => [r.event.number, r.event.title, r.seq, dateText(r.startsAt), timeText(r.startsAt), timeText(r.endsAt), r.room.name, r.note]));
  add("Akun", [{ head: "Nama", width: 28 }, { head: "Email", width: 32 }, { head: "Peran", width: 36 }, { head: "Aktif", width: 8 }, { head: "Email terverifikasi", width: 18 }],
    users.map((x) => [x.person?.name, x.email, joinNames(x.roles.map((r) => `${ROLE_LABEL[r.role.code] ?? r.role.name}${r.teamType ? ` (${r.teamType.name})` : ""}`)), yn(x.isActive), yn(!!x.emailVerifiedAt)]));

  const total = data.reduce((n, d) => n + d.rows, 0);
  const sheets = [
    noteSheet(guide, [
      `# Cadangan data ${tenant?.name ?? "gereja"}`,
      `Dibuat ${dateText(now)} pukul ${timeText(now)} WIB oleh Superadmin.`,
      "",
      "# Isi berkas ini",
      ...data.map((d) => `- ${d.sheet.name}: ${d.rows} baris`),
      `Jadwal, petugas, dan latihan mencakup ${BACKUP_MONTHS_BACK} bulan ke belakang sampai semua acara yang akan datang.`,
      "",
      "# Yang sengaja TIDAK dimasukkan",
      "- Isi rapat dan notulen (terenkripsi supaya Superadmin pun tidak bisa membacanya) dan daftar anggota kelompok rapat (milik kelompok itu).",
      "- Kata sandi, token, perangkat notifikasi, tautan ibadah online, dan kunci enkripsi.",
      "",
      "# Penting: simpan dengan aman",
      "- Berkas ini berisi data pribadi jemaat (nama, tanggal lahir, email) dan tidak dikunci kata sandi.",
      "- Simpan di tempat yang hanya bisa dibuka pengurus yang berwenang. Jangan kirim lewat WhatsApp atau grup, dan hapus salinan di HP atau komputer umum.",
      "",
      "# Cara memakai",
      "- Ini salinan pengaman yang bisa dibaca siapa pun dengan Excel. Data master (orang, tim dan posisi, ruangan, kelompok CG, template) bisa dimasukkan lagi lewat Pengaturan > Impor data pada database yang kosong.",
      "- Impor hanya menambah dan tidak menimpa data yang sudah ada. Pemulihan penuh database yang sedang berjalan dilakukan lewat fitur pemulihan penyedia database (Neon).",
    ]),
    ...data.map((d) => d.sheet),
  ];
  return { file: buildXlsx(sheets), name: backupFileName(now), sheets: data.map((d) => ({ name: d.sheet.name, rows: d.rows })), total };
}

/** Kapan cadangan terakhir diunduh dan oleh siapa (dari log aktivitas). Kosong bila belum pernah. */
export async function lastBackupInfo(tenantId: string) {
  const row = await prisma.auditLog.findFirst({ where: { tenantId, action: "backup.download" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, userId: true } });
  if (!row) return null;
  const who = row.userId ? await prisma.user.findUnique({ where: { id: row.userId }, select: { email: true, person: { select: { name: true } } } }) : null;
  return { at: row.createdAt.toISOString(), by: who?.person?.name ?? who?.email ?? null };
}
