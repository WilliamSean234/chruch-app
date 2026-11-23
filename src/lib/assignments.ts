import { z } from "zod";
import { prisma } from "./prisma";
import { ApiError, badRequest, conflict, notFound } from "./errors";
import { personConflicts, promoteOrphanOverrides, rangesOverlap, releaseBookings, translateOverlap, type PersonConflict, type Range } from "./booking";
import { ebmOutsideWarning, judgePair, teamKind, type OutsideSeat } from "./seatRules";
import { assertNotLocked, isEditable, isLockedByAge } from "./eventStatusFlow";
import { audit } from "./audit";
import { findPairEvent, getEvent } from "./events";
import { twinInfo } from "./rehearsals";
import { can, requirePermission, requireTeamAccess, type AuthUser } from "./rbac";
import { nameKey } from "./names";
import { afterResponse } from "./notify";
import { notifySeatChange } from "./eventNotify";

export const assignBody = z.object({
  personId: z.string().uuid().nullable(), // null = kosongkan kursi
  override: z.object({ reason: z.string().trim().min(5, "Alasan override minimal 5 karakter").max(300) }).optional(),
  /** true = ubahan ini juga diterapkan ke kursi yang sama di Ibadah Minggu pasangan (bila kursinya masih sama). Bawaan: tidak. */
  mirror: z.boolean().optional(),
});

async function loadSeat(u: AuthUser, eventId: string, assignmentId: string) {
  const seat = await prisma.eventAssignment.findFirst({ where: { id: assignmentId, eventId, tenantId: u.tenantId }, include: { ministry: { include: { teamType: true } }, event: true } });
  if (!seat) throw notFound("Kursi");
  requireTeamAccess(u, seat.teamTypeId); // Admin Tim hanya tim miliknya
  return seat;
}

/** Waktu yang dipakai seorang pelayan di kursi ini: acara, plus sesi latihan bila kursinya wajib latihan. */
async function seatRanges(seat: { eventId: string; rehearsalRequired: boolean; event: { startsAt: Date; endsAt: Date } }) {
  const ranges: (Range & { sourceType: "EVENT" | "REHEARSAL"; sourceId: string })[] = [
    { startsAt: seat.event.startsAt, endsAt: seat.event.endsAt, sourceType: "EVENT", sourceId: seat.eventId },
  ];
  if (seat.rehearsalRequired) {
    const rs = await prisma.rehearsalSession.findMany({ where: { eventId: seat.eventId, deletedAt: null }, orderBy: { seq: "asc" } });
    for (const r of rs) ranges.push({ startsAt: r.startsAt, endsAt: r.endsAt, sourceType: "REHEARSAL", sourceId: r.id });
  }
  return ranges;
}

/** Siapa saja anggota EBM (punya pelayanan di tim EBM) di antara orang-orang ini. */
async function ebmPeople(tenantId: string, personIds: string[]) {
  if (!personIds.length) return new Set<string>();
  const rows = await prisma.personMinistry.findMany({
    where: { personId: { in: personIds }, ministry: { deletedAt: null, teamType: { tenantId, deletedAt: null } } },
    select: { personId: true, ministry: { select: { teamType: { select: { name: true } } } } },
  });
  return new Set(rows.filter((r) => teamKind(r.ministry.teamType.name) === "EBM").map((r) => r.personId));
}

type EventSeat = { id: string; personId: string | null; ministry: { name: string; teamType: { name: string } }; person: { name: string } | null };
/** Semua kursi berorang di acara ini, kecuali kursi yang sedang diisi. */
const eventSeats = (eventId: string, exceptId: string) =>
  prisma.eventAssignment.findMany({
    where: { eventId, personId: { not: null }, id: { not: exceptId } },
    select: { id: true, personId: true, ministry: { select: { name: true, teamType: { select: { name: true } } } }, person: { select: { name: true } } },
  }) as Promise<EventSeat[]>;

/**
 * Menilai orang ini untuk kursi ini terhadap kursi-kursi lain di acara yang sama:
 * - `blocked`: pesan bila dilarang (EBM tidak boleh merangkap Usher/pemusik),
 * - `allowedSeatIds`: kursi lain miliknya yang boleh dirangkap (PIC dan Usher), beserta catatannya,
 * - `ebmWarning`: peringatan bila sudah ada anggota EBM lain di luar EBM.
 */
function judgeAgainstEvent(seat: { id: string; ministry: { name: string; teamType: { name: string } } }, person: { id: string; name: string }, others: EventSeat[], ebm: Set<string>) {
  const mine = { teamName: seat.ministry.teamType.name, ministryName: seat.ministry.name };
  const allowedSeatIds = new Set<string>();
  const notes: string[] = [];
  let blocked: string | null = null;
  for (const o of others.filter((x) => x.personId === person.id)) {
    const v = judgePair(mine, { teamName: o.ministry.teamType.name, ministryName: o.ministry.name }, person.name);
    if (v.kind === "BLOCKED") blocked = blocked ?? v.message;
    else if (v.kind === "ALLOWED") { allowedSeatIds.add(o.id); notes.push(v.note); }
  }
  const outside: OutsideSeat[] = others
    .filter((o) => o.personId && ebm.has(o.personId))
    .map((o) => ({ personId: o.personId!, name: o.person!.name, ministryName: o.ministry.name, teamName: o.ministry.teamType.name }));
  const ebmWarning = ebmOutsideWarning({ personId: person.id, personIsEbm: ebm.has(person.id), seatTeamName: mine.teamName, others: outside });
  return { blocked, allowedSeatIds, notes, ebmWarning };
}

const withoutAllowed = (found: PersonConflict[], allowed: Set<string>) => found.filter((c) => !(c.assignmentId && allowed.has(c.assignmentId)));

/** `mirror`: ikut ubah kursi kembar di acara pasangan. `notify: false` mematikan notifikasi ke pelayan (untuk pekerjaan massal). */
type AssignOpts = { mirror?: boolean; notify?: boolean };

/** Kabari pelayan bila kursi di acara yang sudah terbit berganti orang. Dijalankan setelah respons dikirim. */
function announceSeat(seat: Awaited<ReturnType<typeof loadSeat>>, newPersonId: string | null, opts: AssignOpts) {
  if (opts.notify === false || seat.event.status !== "PUBLISHED" || seat.event.endsAt.getTime() < Date.now()) return;
  const old = seat.personId;
  if (old === newPersonId) return;
  const ref = (personId: string | null) => (personId ? { personId, ministryId: seat.ministryId } : undefined);
  afterResponse(() => notifySeatChange(seat.tenantId, seat.eventId, { removed: ref(old), added: ref(newPersonId) }));
}

/**
 * Isi atau kosongkan satu kursi.
 * Bentrok = diblokir (409 PERSON_CONFLICT). Hanya Superadmin yang boleh menembus dengan alasan, dan itu dicatat di audit log.
 */
export async function assignPerson(u: AuthUser, eventId: string, assignmentId: string, body: z.infer<typeof assignBody>, opts: AssignOpts = {}) {
  const { warnings } = await assignCore(u, eventId, assignmentId, body, opts);
  return { event: await getEvent(u.tenantId, eventId), warnings };
}

/** Isi inti tanpa memuat ulang seluruh acara (untuk pekerjaan massal seperti upload jadwal). Mengembalikan catatan untuk pengguna. */
export async function assignCore(u: AuthUser, eventId: string, assignmentId: string, body: z.infer<typeof assignBody>, opts: AssignOpts = {}): Promise<{ warnings: string[] }> {
  const seat = await loadSeat(u, eventId, assignmentId);
  if (!isEditable(seat.event.status)) throw conflict("Acara yang sudah dibatalkan tidak bisa diubah.");
  assertNotLocked(seat.event.startsAt);
  if (body.personId !== null && seat.event.bandMode === "NO_BAND" && seat.ministry.bandOnly) throw conflict(`Ibadah ini No Band, jadi posisi ${seat.ministry.name} tidak dipakai. Ubah ke Band dulu bila perlu.`);

  // latihan Ibadah Minggu 1 dan 2 di hari yang sama adalah satu latihan ("kembar"): bukan bentrok satu sama lain
  const tw = seat.rehearsalRequired ? await twinInfo(u.tenantId, seat.event) : { pairId: null, twins: new Map<string, string>() };
  const promoteIn = tw.pairId ? [eventId, tw.pairId] : eventId;

  if (body.personId === null) {
    await prisma.$transaction(async (tx) => {
      await releaseBookings(tx, { assignmentId });
      await tx.eventAssignment.update({ where: { id: assignmentId }, data: { personId: null } });
      if (seat.personId) await promoteOrphanOverrides(tx, u.tenantId, seat.personId, promoteIn);
    });
    announceSeat(seat, null, opts);
    return { warnings: opts.mirror === false ? [] : await mirrorToPair(u, seat, null) };
  }

  const [person, ranges, capable] = await Promise.all([
    prisma.person.findFirst({ where: { id: body.personId, tenantId: u.tenantId, deletedAt: null } }),
    seatRanges(seat),
    prisma.personMinistry.count({ where: { personId: body.personId, ministryId: seat.ministryId } }),
  ]);
  if (!person) throw notFound("Orang");
  if (seat.personId === person.id) return { warnings: [] };

  const others = await eventSeats(eventId, assignmentId);
  const ebm = await ebmPeople(u.tenantId, [person.id, ...others.map((o) => o.personId!)]);
  const verdict = judgeAgainstEvent(seat, person, others, ebm);
  if (verdict.blocked) {
    throw new ApiError(409, "SEAT_RULE", verdict.blocked, { canOverride: false }); // aturan merangkap: tidak bisa ditembus override
  }

  const twinIds = [...tw.twins.values()];
  const foundAll = (await personConflicts(u.tenantId, [person.id], ranges, { excludeAssignmentId: assignmentId, currentEventId: eventId, ...(twinIds.length ? { excludeSource: twinIds.map((id) => ({ sourceType: "REHEARSAL", sourceId: id })) } : {}) })).get(person.id) ?? [];
  // jam latihan yang sudah dikunci untuk orang ini lewat kursi di acara pasangan: baris barunya ditandai override supaya tidak bentrok dengan dirinya
  const shadowed = new Set<string>();
  if (twinIds.length) {
    const rows = await prisma.booking.findMany({ where: { tenantId: u.tenantId, resourceType: "PERSON", resourceId: person.id, sourceType: "REHEARSAL", sourceId: { in: twinIds }, deletedAt: null }, select: { sourceId: true } });
    const have = new Set(rows.map((r) => r.sourceId));
    for (const [mine, twin] of tw.twins) if (have.has(twin)) shadowed.add(mine);
  }
  const found = withoutAllowed(foundAll, verdict.allowedSeatIds); // merangkap yang dibolehkan bukan bentrok

  if (found.length) {
    if (!body.override) {
      throw new ApiError(409, "PERSON_CONFLICT", `${person.name} sudah terjadwal di tempat lain pada jam itu: ${found.map((c) => c.label).join("; ")}.`, {
        conflicts: found.map((c) => ({ label: c.label, startsAt: c.startsAt.toISOString(), endsAt: c.endsAt.toISOString(), sameEvent: c.sameEvent })),
        canOverride: can(u, "booking.override"),
      });
    }
    requirePermission(u, "booking.override");
  }

  await translateOverlap(
    () =>
      prisma.$transaction(async (tx) => {
        await releaseBookings(tx, { assignmentId });
        await tx.eventAssignment.update({ where: { id: assignmentId }, data: { personId: person.id } });
        await tx.booking.createMany({
          data: ranges.map((r) => ({
            tenantId: u.tenantId, resourceType: "PERSON", resourceId: person.id, startsAt: r.startsAt, endsAt: r.endsAt,
            sourceType: r.sourceType, sourceId: r.sourceId, assignmentId,
            // jam yang bentrok (termasuk dengan kursi lain miliknya yang dibolehkan, mis. PIC dan Usher) ditandai override
            isOverride: (r.sourceType === "REHEARSAL" && shadowed.has(r.sourceId)) || foundAll.some((c) => rangesOverlap(c, r)),
          })),
        });
        if (seat.personId && seat.personId !== person.id) await promoteOrphanOverrides(tx, u.tenantId, seat.personId, promoteIn); // orang yang digantikan
      }),
    `${person.name} baru saja dijadwalkan di tempat lain pada jam itu. Muat ulang lalu coba lagi.`,
  );

  announceSeat(seat, person.id, opts);

  if (found.length && body.override) {
    await audit({
      tenantId: u.tenantId, userId: u.userId, action: "booking.override", entity: "EventAssignment", entityId: assignmentId, reason: body.override.reason,
      payload: { eventId, personId: person.id, personName: person.name, conflicts: found.map((c) => c.label) },
    });
  }

  const warnings: string[] = [...verdict.notes];
  if (!capable) warnings.push(`${person.name} belum tercatat bisa ${seat.ministry.name}.`);
  if (verdict.ebmWarning) warnings.push(verdict.ebmWarning);
  if (opts.mirror !== false) warnings.push(...(await mirrorToPair(u, seat, person)));
  return { warnings };
}

/**
 * Ibadah Minggu 1 dan 2 berpersonel sama: bila kursi di salah satunya diubah, kursi yang sama di pasangannya (hari yang sama)
 * ikut berubah, selama kursi itu masih sama dengan sebelum diubah (sama-sama kosong atau sama orangnya). Kursi yang sudah
 * sengaja dibedakan tidak disentuh, jadi tiap acara tetap bisa diedit sendiri. Yang ditolak aturan biasa (bentrok, aturan EBM)
 * dilewati dan dilaporkan, tidak menggagalkan perubahan utama. Mengembalikan catatan untuk pengguna.
 */
async function mirrorToPair(u: AuthUser, seat: Awaited<ReturnType<typeof loadSeat>>, person: { id: string; name: string } | null): Promise<string[]> {
  const before = seat.personId; // isi kursi ini sebelum diubah
  if ((person?.id ?? null) === before) return [];
  const pair = await findPairEvent(u.tenantId, seat.event);
  if (!pair || !isEditable(pair.status) || isLockedByAge(pair.startsAt)) return [];
  const twin = pair.assignments.find((a) => a.ministryId === seat.ministryId && a.slotNo === seat.slotNo);
  if (!twin || twin.personId !== before) return []; // tidak ada kursi kembar, atau sudah dibedakan
  try {
    await assignCore(u, pair.id, twin.id, { personId: person?.id ?? null }, { mirror: false });
  } catch (err) {
    if (err instanceof ApiError) return [`Tidak ikut diubah di ${pair.title} (${seat.ministry.name}): ${err.message}`];
    throw err;
  }
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "assignment.set", entity: "EventAssignment", entityId: twin.id, payload: { eventId: pair.id, personId: person?.id ?? null, mirroredFrom: seat.id } });
  return [person ? `${person.name} juga diisi di ${pair.title}.` : `Kursi ${seat.ministry.name} juga dikosongkan di ${pair.title}.`];
}

/**
 * Saran orang untuk satu kursi: yang punya kemampuan posisi itu, dipisah tersedia / tidak tersedia (beserta alasannya).
 * `includeOthers` menambahkan orang lain yang belum tercatat bisa posisi tersebut.
 */
type MinistryLite = { id: string; name: string; sortOrder: number; deletedAt: Date | null; teamType: { name: string; sortOrder: number } };
/** Daftar pelayanan satu orang, dikelompokkan per tim: bahan pertimbangan saat memetakan orang ke posisi. */
function servicesOf(list: MinistryLite[], seatMinistryId: string) {
  const byTeam = new Map<string, { team: string; order: number; items: { name: string; order: number; current: boolean }[] }>();
  for (const m of list.filter((x) => !x.deletedAt)) {
    const g = byTeam.get(m.teamType.name) ?? { team: m.teamType.name, order: m.teamType.sortOrder, items: [] };
    g.items.push({ name: m.name, order: m.sortOrder, current: m.id === seatMinistryId });
    byTeam.set(m.teamType.name, g);
  }
  return [...byTeam.values()]
    .sort((a, b) => a.order - b.order || a.team.localeCompare(b.team))
    .map((g) => ({ team: g.team, items: g.items.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)).map((i) => ({ name: i.name, current: i.current })) }));
}

export async function suggestForSeat(u: AuthUser, eventId: string, assignmentId: string, q: { search?: string; includeOthers: boolean }) {
  const seat = await loadSeat(u, eventId, assignmentId);
  const ranges = await seatRanges(seat);

  // Kursi EBM hanya menampilkan anggota EBM (punya pelayanan di tim EBM); orang di luar EBM tidak ditampilkan sama sekali.
  let ebmOnly: object = {};
  if (teamKind(seat.ministry.teamType.name) === "EBM") {
    const teams = await prisma.teamType.findMany({ where: { tenantId: u.tenantId, deletedAt: null }, select: { id: true, name: true } });
    const ids = teams.filter((t) => teamKind(t.name) === "EBM").map((t) => t.id);
    ebmOnly = { ministries: { some: { ministry: { deletedAt: null, teamTypeId: { in: ids } } } } };
  }

  const people = await prisma.person.findMany({
    where: {
      tenantId: u.tenantId, deletedAt: null,
      ...ebmOnly,
      ...(q.search ? { nameKey: { contains: nameKey(q.search) } } : {}),
      ...(q.includeOthers ? {} : { AND: [{ ministries: { some: { ministryId: seat.ministryId } } }] }),
    },
    include: { ministries: { select: { ministryId: true, ministry: { select: { id: true, name: true, sortOrder: true, deletedAt: true, teamType: { select: { name: true, sortOrder: true } } } } } } },
    orderBy: { nameKey: "asc" },
    take: 200,
  });
  const conflicts = await personConflicts(u.tenantId, people.map((p) => p.id), ranges, { excludeAssignmentId: assignmentId, currentEventId: eventId });
  const others = await eventSeats(eventId, assignmentId);
  const ebm = await ebmPeople(u.tenantId, [...people.map((p) => p.id), ...others.map((o) => o.personId!)]);

  const rows = people.map((p) => {
    const v = judgeAgainstEvent(seat, p, others, ebm);
    const list = withoutAllowed(conflicts.get(p.id) ?? [], v.allowedSeatIds).filter((c) => !(v.blocked && c.sameEvent));
    return {
      id: p.id, name: p.name, title: p.title,
      services: servicesOf(p.ministries.map((m) => m.ministry), seat.ministryId),
      capable: p.ministries.some((m) => m.ministryId === seat.ministryId),
      isCurrent: seat.personId === p.id,
      conflicts: [...(v.blocked ? [v.blocked] : []), ...list.map((c) => c.label)],
      notes: [...v.notes, ...(v.ebmWarning ? [v.ebmWarning] : [])], // catatan, bukan larangan
    };
  });
  const sortCapableFirst = (a: (typeof rows)[number], b: (typeof rows)[number]) => Number(b.capable) - Number(a.capable);
  return {
    seat: { id: seat.id, ministryId: seat.ministryId, ministry: seat.ministry.name, slotNo: seat.slotNo, rehearsalRequired: seat.rehearsalRequired },
    available: rows.filter((r) => r.conflicts.length === 0).sort(sortCapableFirst),
    unavailable: rows.filter((r) => r.conflicts.length > 0).sort(sortCapableFirst),
  };
}

// ───────── Salin personel dari acara lain (mis. Ibadah Minggu 1 ke Ibadah Minggu 2) ─────────

export const copyBody = z.object({ sourceEventId: z.string().uuid() });

/**
 * Isi kursi yang masih kosong di acara ini dengan orang dari kursi yang sama (posisi dan nomor kursi) di acara sumber.
 * Kursi yang sudah berorang tidak disentuh. Tiap kursi melewati pemeriksaan biasa (bentrok, aturan EBM, merangkap);
 * yang ditolak dilewati dan dilaporkan, sisanya tetap terisi. Sesudahnya tiap kursi tetap bisa diubah satu per satu.
 */
export async function copyPersonnel(u: AuthUser, targetEventId: string, sourceEventId: string) {
  if (targetEventId === sourceEventId) throw badRequest("Pilih acara lain sebagai sumber.");
  const where = (id: string) => ({ id, tenantId: u.tenantId, deletedAt: null, kind: "IBADAH" });
  const [target, source] = await Promise.all([
    prisma.event.findFirst({ where: where(targetEventId), include: { assignments: { include: { ministry: true }, orderBy: [{ sortOrder: "asc" }, { slotNo: "asc" }] } } }),
    prisma.event.findFirst({ where: where(sourceEventId), include: { assignments: { include: { person: true } } } }),
  ]);
  if (!target || !source) throw notFound("Acara");
  if (!isEditable(target.status)) throw conflict("Acara yang sudah dibatalkan tidak bisa diubah.");
  assertNotLocked(target.startsAt);

  const from = new Map(source.assignments.filter((a) => a.personId).map((a) => [`${a.ministryId}:${a.slotNo}`, a]));
  let filled = 0;
  const skipped: { label: string; person: string; reason: string }[] = [];
  const notes = new Set<string>();
  for (const seat of target.assignments) {
    if (seat.personId) continue;
    const src = from.get(`${seat.ministryId}:${seat.slotNo}`);
    if (!src) continue;
    const label = target.assignments.filter((x) => x.ministryId === seat.ministryId).length > 1 ? `${seat.ministry.name} ${seat.slotNo}` : seat.ministry.name;
    try {
      const r = await assignCore(u, targetEventId, seat.id, { personId: src.personId }, { mirror: false, notify: false });
      filled++;
      for (const w of r.warnings) if (!w.includes("belum tercatat bisa")) notes.add(w);
    } catch (e) {
      if (e instanceof ApiError) skipped.push({ label, person: src.person!.name, reason: e.message });
      else throw e;
    }
  }
  return { filled, skipped, notes: [...notes], event: await getEvent(u.tenantId, targetEventId) };
}
