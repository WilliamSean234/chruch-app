import { z } from "zod";
import { prisma } from "./prisma";
import { forbidden } from "./errors";
import { can, requireTeamAccess, teamScope, type AuthUser } from "./rbac";
import { pageOf, pagingQuery, resolvePaging } from "./paging";
import { zonedToUtc } from "./time";
import { eventYears } from "./years";
import { buildXlsx } from "./xlsxWrite";
import { dateText, noteSheet, tableSheet } from "./backupSheets";
import { buildLoad, loadFileName, MAX_RANGE_DAYS, rangeError, teamsText, type IdlePerson, type LoadSeat } from "./loadStats";

export const loadQuery = z
  .object({
    from: z.string(),
    to: z.string(),
    team: z.string().uuid().optional(), // satu tim saja; kosong = semua tim yang boleh dilihat
    sort: z.enum(["beban", "sedikit", "nama"]).default("beban"),
    format: z.enum(["xlsx"]).optional(),
    ...pagingQuery,
  })
  .superRefine((q, ctx) => {
    const e = rangeError(q.from, q.to);
    if (e) ctx.addIssue({ code: "custom", message: e, path: ["from"] });
  });
export type LoadQuery = z.infer<typeof loadQuery>;

/** Batas kursi yang dibaca sekali jalan (rentang paling lama 12 bulan); lewat dari ini hasilnya dipotong dan diberi tanda. */
const MAX_SEATS = 20_000;
/** Batas pencarian "terakhir bertugas sebelum periode" bagi yang belum bertugas. */
const MAX_LAST_LOOKUP = 3_000;

/** Yang boleh melihat: yang boleh mengatur petugas (Superadmin, Penjadwal, Admin Tim). */
function requireAccess(u: AuthUser) {
  if (!can(u, "assignment.write")) throw forbidden();
}

/**
 * Hitung beban semua orang untuk periode dan tim yang dipilih. Hanya ibadah yang sudah terbit dan tidak dibatalkan; rapat tidak ikut.
 * Admin Tim hanya melihat tugas di timnya sendiri (cakupan tim), termasuk pada rincian dan jumlah total.
 */
async function compute(u: AuthUser, q: LoadQuery) {
  requireAccess(u);
  const scope = teamScope(u);
  if (q.team) requireTeamAccess(u, q.team);
  const teamFilter: string[] | null = q.team ? [q.team] : scope;
  const gte = zonedToUtc(q.from, "00:00");
  const lte = zonedToUtc(q.to, "23:59");
  const eventWhere = { deletedAt: null, kind: "IBADAH", status: "PUBLISHED" } as const;

  const [seatRows, teams, years, capable] = await Promise.all([
    prisma.eventAssignment.findMany({
      where: {
        tenantId: u.tenantId, personId: { not: null },
        ...(teamFilter ? { teamTypeId: { in: teamFilter } } : {}),
        event: { ...eventWhere, startsAt: { gte, lte } },
      },
      select: {
        personId: true, eventId: true, teamTypeId: true,
        person: { select: { name: true } },
        ministry: { select: { name: true, teamType: { select: { name: true } } } },
        event: { select: { startsAt: true } },
      },
      take: MAX_SEATS + 1,
    }),
    prisma.teamType.findMany({
      where: { tenantId: u.tenantId, deletedAt: null, ...(scope ? { id: { in: scope } } : {}) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    eventYears(u.tenantId, "IBADAH"),
    prisma.personMinistry.findMany({
      where: {
        person: { tenantId: u.tenantId, deletedAt: null },
        ministry: { deletedAt: null, ...(teamFilter ? { teamTypeId: { in: teamFilter } } : {}) },
      },
      select: { personId: true, person: { select: { name: true } }, ministry: { select: { name: true, sortOrder: true } } },
    }),
  ]);

  const truncated = seatRows.length > MAX_SEATS;
  const seats: LoadSeat[] = seatRows.slice(0, MAX_SEATS).map((s) => ({
    personId: s.personId!, personName: s.person?.name ?? "Pelayan", eventId: s.eventId, at: s.event.startsAt.toISOString(),
    teamTypeId: s.teamTypeId, teamName: s.ministry.teamType.name, ministryName: s.ministry.name,
  }));

  // calon yang bisa melayani di tim yang dilihat (untuk menampilkan yang belum bertugas)
  const byPerson = new Map<string, { name: string; ms: { name: string; order: number }[] }>();
  for (const c of capable) {
    const e = byPerson.get(c.personId) ?? { name: c.person.name, ms: [] };
    e.ms.push({ name: c.ministry.name, order: c.ministry.sortOrder });
    byPerson.set(c.personId, e);
  }
  const idle: IdlePerson[] = [...byPerson].map(([id, e]) => ({ id, name: e.name, ministries: e.ms.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "id")).map((m) => m.name) }));

  // terakhir bertugas sebelum periode, hanya untuk yang belum bertugas di periode ini
  const served = new Set(seats.map((s) => s.personId));
  const idleIds = idle.filter((p) => !served.has(p.id)).map((p) => p.id);
  const lastBefore = new Map<string, string>();
  if (idleIds.length) {
    const prev = await prisma.eventAssignment.findMany({
      where: {
        tenantId: u.tenantId, personId: { in: idleIds },
        ...(teamFilter ? { teamTypeId: { in: teamFilter } } : {}),
        event: { ...eventWhere, startsAt: { lt: gte } },
      },
      select: { personId: true, event: { select: { startsAt: true } } },
      orderBy: { event: { startsAt: "desc" } },
      take: MAX_LAST_LOOKUP,
    });
    for (const r of prev) if (r.personId && !lastBefore.has(r.personId)) lastBefore.set(r.personId, r.event.startsAt.toISOString());
  }

  const { rows, summary } = buildLoad(seats, idle, lastBefore, q.sort);
  return { rows, summary, teams, years, truncated, scoped: scope !== null, teamLabel: q.team ? teams.find((t) => t.id === q.team)?.name ?? "" : "" };
}

/** Daftar berhalaman untuk layar. */
export async function listLoad(u: AuthUser, q: LoadQuery) {
  const pg = resolvePaging(q);
  const d = await compute(u, q);
  return {
    ...pageOf(d.rows.slice(pg.skip, pg.skip + pg.take), d.rows.length, pg),
    summary: d.summary,
    scoped: d.scoped,
    truncated: d.truncated,
    options: { teams: d.teams, years: d.years },
  };
}

/** Berkas Excel: semua baris (tanpa paging) plus lembar petunjuk cara membaca angkanya. */
export async function loadWorkbook(u: AuthUser, q: LoadQuery) {
  const d = await compute(u, q);
  const LEVEL = { BELUM: "Belum bertugas", TINGGI: "Beban tinggi", WAJAR: "" } as const;
  const table = tableSheet(
    "Beban pelayan",
    [
      { head: "Nama", width: 30 }, { head: "Posisi utama", width: 22 }, { head: "Ibadah", width: 10 }, { head: "Kursi", width: 10 },
      { head: "Rincian per tim (ibadah)", width: 40 }, { head: "Terakhir bertugas", width: 18 }, { head: "Keterangan", width: 16 },
    ],
    d.rows.map((r) => [r.name, r.main, r.events, r.seats, teamsText(r.teams), r.last ? dateText(new Date(r.last)) : "", LEVEL[r.level]]),
  );
  const note = noteSheet("Petunjuk", [
    "# Cara membaca statistik beban pelayan",
    `- Periode: ${q.from} sampai ${q.to}${d.teamLabel ? ` · Tim: ${d.teamLabel}` : d.scoped ? " · Hanya tim yang menjadi tanggung jawab Anda" : " · Semua tim"}.`,
    "- Yang dihitung hanya ibadah yang sudah terbit dan tidak dibatalkan. Rapat tidak ikut. Ini angka jadwal, bukan kehadiran sebenarnya.",
    "- Ibadah: berapa ibadah berbeda tempat orang itu bertugas. Dua posisi di ibadah yang sama dihitung satu ibadah.",
    "- Kursi: berapa posisi yang ia pegang. Bisa lebih besar dari Ibadah.",
    "- Rincian per tim: jumlah ibadah di tiap tim. Jumlahnya bisa lebih besar dari kolom Ibadah bila satu ibadah melibatkan orang itu di dua tim.",
    "- Beban tinggi: sedikitnya 3 ibadah dan sedikitnya 1,5 kali rata-rata orang yang bertugas.",
    "- Belum bertugas: orang yang tercatat bisa melayani di tim ini tetapi tidak dijadwalkan di periode ini. Tanggal terakhir diambil dari jadwal sebelum periode (dibatasi data yang dibaca).",
    `- Rentang paling lama ${MAX_RANGE_DAYS} hari.`,
    ...(d.truncated ? ["- Data dipotong karena terlalu banyak kursi. Persempit periodenya."] : []),
    "- Berkas ini berisi nama jemaat. Simpan di tempat yang aman dan jangan dibagikan ke grup umum.",
  ]);
  return { file: buildXlsx([table, note]), name: loadFileName(q.from, q.to), count: d.rows.length };
}
