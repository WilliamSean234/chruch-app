import { z } from "zod";
import { prisma } from "./prisma";
import { ApiError, badRequest, conflict, notFound } from "./errors";
import { addMinutes, DATE_RE, localParts, TIME_RE, zonedToUtc } from "./time";
import { assertRoomFree, assertRoomUsable, bookRoom, personConflicts, promoteOrphanOverrides, rangesOverlap, releaseBookings, translateOverlap, type PersonConflict, type Range } from "./booking";
import { assertNotLocked, isEditable, isLockedByAge } from "./eventStatusFlow";
import { findPairEvent } from "./events";
import { isTwinSlot, rehearsalLimit, rehearsalTimingError } from "./rehearsalRules";
import { audit } from "./audit";
import { judgePair } from "./seatRules";
import { can, requirePermission, requireTeamAccess, teamScope, type AuthUser } from "./rbac";

const overrideSchema = z.object({ reason: z.string().trim().min(5, "Alasan override minimal 5 karakter").max(300) }).optional();

export const rehearsalBody = z.object({
  date: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE),
  durationMin: z.number().int().min(15).max(480).default(120),
  roomId: z.string().uuid(),
  note: z.string().trim().max(200).nullish(),
  override: overrideSchema,
});
export const rehearsalPatch = rehearsalBody.partial({ date: true, startTime: true, durationMin: true, roomId: true });
export const requiredBody = z.object({ required: z.boolean(), override: overrideSchema });
export const bulkRequiredBody = z.object({ required: z.boolean(), teamTypeId: z.string().uuid().optional(), ministryId: z.string().uuid().optional() });

async function loadEvent(tenantId: string, eventId: string) {
  const e = await prisma.event.findFirst({ where: { id: eventId, tenantId, deletedAt: null, kind: "IBADAH" } });
  if (!e) throw notFound("Acara");
  if (!isEditable(e.status)) throw conflict("Acara yang sudah dibatalkan tidak bisa diubah.");
  assertNotLocked(e.startsAt);
  return e;
}

const fmtLocal = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { timeZone: process.env.APP_TIMEZONE ?? "Asia/Jakarta", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

type EvLite = { id: string; templateId: string | null; startsAt: Date };

/**
 * Ibadah Minggu 1 dan 2 di hari yang sama memakai latihan yang sama, jadi satu sesi latihan dibuat sekali dan otomatis ada di keduanya
 * ("kembar": jam dan ruangan sama). Ruangan hanya dipesan oleh satu sesi; peserta wajib dari kedua acara dikunci jamnya.
 * `usable` = acara pasangan masih bisa diubah (tidak batal dan belum terkunci); bila tidak, latihannya tidak disentuh.
 */
async function pairFor(tenantId: string, ev: EvLite) {
  const pair = await findPairEvent(tenantId, ev);
  if (!pair) return null;
  const usable = isEditable(pair.status) && !isLockedByAge(pair.startsAt);
  const sessions = await prisma.rehearsalSession.findMany({ where: { eventId: pair.id, deletedAt: null }, orderBy: { seq: "asc" } });
  return { id: pair.id, title: pair.title, startsAt: pair.startsAt, usable, sessions };
}

/** Sesi latihan acara ini yang punya kembaran di acara pasangan: id sesi → id kembarannya. Dipakai agar latihan yang sama tidak dianggap bentrok. */
export async function twinInfo(tenantId: string, ev: EvLite): Promise<{ pairId: string | null; twins: Map<string, string> }> {
  const pair = await pairFor(tenantId, ev);
  const twins = new Map<string, string>();
  if (!pair) return { pairId: null, twins };
  const mine = await prisma.rehearsalSession.findMany({ where: { eventId: ev.id, deletedAt: null } });
  for (const m of mine) { const t = pair.sessions.find((x) => isTwinSlot(m, x)); if (t) twins.set(m.id, t.id); }
  return { pairId: pair.id, twins };
}

const seatLabel = (s: { ministry: { name: string }; slotNo: number }, all: { ministryId: string }[], id: string) =>
  all.filter((x) => x.ministryId === id).length > 1 ? `${s.ministry.name} ${s.slotNo}` : s.ministry.name;

/** Sesi latihan dan daftar peserta. Peserta = semua yang terjadwal di acara; wajib atau tidak ditentukan per kursi. */
export async function listRehearsals(tenantId: string, eventId: string) {
  const ev = await prisma.event.findFirst({ where: { id: eventId, tenantId, deletedAt: null, kind: "IBADAH" } });
  if (!ev) throw notFound("Acara");
  const [sessions, seats] = await Promise.all([
    prisma.rehearsalSession.findMany({ where: { eventId, deletedAt: null }, include: { room: true }, orderBy: { seq: "asc" } }),
    prisma.eventAssignment.findMany({ where: { eventId }, include: { ministry: true, person: true }, orderBy: [{ sortOrder: "asc" }, { slotNo: "asc" }] }),
  ]);
  const tw = sessions.length ? await twinInfo(tenantId, ev) : { pairId: null, twins: new Map<string, string>() };
  return {
    sessions: sessions.map((r) => ({ id: r.id, seq: r.seq, startsAt: r.startsAt.toISOString(), endsAt: r.endsAt.toISOString(), room: { id: r.room.id, name: r.room.name }, note: r.note, shared: tw.twins.has(r.id) })),
    participants: seats.filter((s) => s.person).map((s) => ({
      assignmentId: s.id, teamTypeId: s.teamTypeId, ministryId: s.ministryId, label: seatLabel(s, seats, s.ministryId),
      person: { id: s.person!.id, name: s.person!.name }, rehearsalRequired: s.rehearsalRequired,
    })),
  };
}

async function requiredPeople(eventId: string) {
  const seats = await prisma.eventAssignment.findMany({ where: { eventId, personId: { not: null }, rehearsalRequired: true }, include: { person: true, ministry: true } });
  // Orang yang merangkap dua kursi (mis. PIC dan Usher) hanya satu baris biasa; baris kursi berikutnya ditandai override supaya tidak bentrok dengan dirinya.
  const seen = new Set<string>();
  return seats.map((s) => {
    const dup = seen.has(s.personId!);
    seen.add(s.personId!);
    return { assignmentId: s.id, personId: s.personId!, name: s.person!.name, ministry: s.ministry.name, dup };
  });
}

function conflictError(people: { personId: string; name: string }[], map: Map<string, PersonConflict[]>, u: AuthUser, what: string) {
  const lines = people.filter((p) => map.has(p.personId)).map((p) => `${p.name}: ${map.get(p.personId)!.map((c) => c.label).join(", ")}`);
  return new ApiError(409, "REHEARSAL_CONFLICT", `${what} bentrok untuk peserta wajib: ${lines.join(" | ")}.`, {
    people: people.filter((p) => map.has(p.personId)).map((p) => ({ personId: p.personId, name: p.name, conflicts: map.get(p.personId)!.map((c) => c.label) })),
    canOverride: can(u, "booking.override"),
  });
}

/**
 * Tambah sesi latihan. Ruangan dan semua peserta wajib dikunci; bentrok = ditolak (kecuali override Superadmin).
 * Latihan harus dimulai sebelum ibadah. Bila ada Ibadah Minggu 1/2 pasangan di hari yang sama, latihan yang sama otomatis dibuat di keduanya.
 */
export async function createRehearsal(u: AuthUser, eventId: string, b: z.infer<typeof rehearsalBody>) {
  const ev = await loadEvent(u.tenantId, eventId);
  const startsAt = zonedToUtc(b.date, b.startTime);
  const endsAt = addMinutes(startsAt, b.durationMin);
  const pair = await pairFor(u.tenantId, ev);
  const limit = rehearsalLimit(ev.startsAt, pair?.startsAt);
  const timing = rehearsalTimingError(startsAt, limit, fmtLocal(limit));
  if (timing) throw badRequest(timing);
  await assertRoomUsable(u.tenantId, b.roomId);
  await assertRoomFree(u.tenantId, b.roomId, startsAt, endsAt);

  const slot = { startsAt, endsAt, roomId: b.roomId };
  const mirror = pair && pair.usable && !pair.sessions.some((x) => isTwinSlot(slot, x)) ? pair : null; // sudah ada latihan yang sama di pasangan: tidak dobel
  const people = await requiredPeople(eventId);
  const pairPeople = mirror ? await requiredPeople(mirror.id) : [];
  const everyone = [...people, ...pairPeople.filter((p) => !people.some((x) => x.personId === p.personId))];
  const conf = await personConflicts(u.tenantId, everyone.map((p) => p.personId), [{ startsAt, endsAt }], { currentEventId: eventId });
  if (conf.size) {
    if (!b.override) throw conflictError(everyone, conf, u, "Jadwal latihan");
    requirePermission(u, "booking.override");
  }

  const last = await prisma.rehearsalSession.aggregate({ where: { eventId }, _max: { seq: true } }); // termasuk yang sudah dihapus (unique eventId+seq)
  const seq = (last._max.seq ?? 0) + 1;
  const lastPair = mirror ? await prisma.rehearsalSession.aggregate({ where: { eventId: mirror.id }, _max: { seq: true } }) : null;
  const created = await translateOverlap(
    () =>
      prisma.$transaction(async (tx) => {
        const r = await tx.rehearsalSession.create({ data: { tenantId: u.tenantId, eventId, seq, startsAt, endsAt, roomId: b.roomId, note: b.note ?? null } });
        await bookRoom(tx, { tenantId: u.tenantId, roomId: b.roomId, startsAt, endsAt, sourceType: "REHEARSAL", sourceId: r.id });
        if (people.length) {
          await tx.booking.createMany({
            data: people.map((p) => ({
              tenantId: u.tenantId, resourceType: "PERSON", resourceId: p.personId, startsAt, endsAt, sourceType: "REHEARSAL", sourceId: r.id, assignmentId: p.assignmentId, isOverride: conf.has(p.personId) || p.dup,
            })),
          });
        }
        if (mirror) {
          // kembaran di acara pasangan: tanpa pemesanan ruangan kedua (ruangannya sama dan sudah dipesan); jam orang yang sudah terkunci di atas ditandai override
          const t = await tx.rehearsalSession.create({ data: { tenantId: u.tenantId, eventId: mirror.id, seq: (lastPair!._max.seq ?? 0) + 1, startsAt, endsAt, roomId: b.roomId, note: b.note ?? null } });
          const taken = new Set(people.map((p) => p.personId));
          if (pairPeople.length) {
            await tx.booking.createMany({
              data: pairPeople.map((p) => ({
                tenantId: u.tenantId, resourceType: "PERSON", resourceId: p.personId, startsAt, endsAt, sourceType: "REHEARSAL", sourceId: t.id, assignmentId: p.assignmentId, isOverride: conf.has(p.personId) || p.dup || taken.has(p.personId),
              })),
            });
          }
        }
        return r;
      }),
    "Latihan bentrok: ruangan atau salah satu peserta wajib baru saja terpakai. Muat ulang lalu coba lagi.",
  );
  if (conf.size && b.override) {
    await audit({
      tenantId: u.tenantId, userId: u.userId, action: "booking.override", entity: "RehearsalSession", entityId: created.id, reason: b.override.reason,
      payload: { eventId: ev.id, people: everyone.filter((p) => conf.has(p.personId)).map((p) => p.name) },
    });
  }
  return { id: created.id, mirroredTo: mirror ? mirror.title : null, ...(await listRehearsals(u.tenantId, eventId)) };
}

export async function updateRehearsal(u: AuthUser, eventId: string, rid: string, b: z.infer<typeof rehearsalPatch>) {
  const ev = await loadEvent(u.tenantId, eventId);
  const cur = await prisma.rehearsalSession.findFirst({ where: { id: rid, eventId, tenantId: u.tenantId, deletedAt: null } });
  if (!cur) throw notFound("Sesi latihan");

  const was = localParts(cur.startsAt);
  const curDur = Math.round((cur.endsAt.getTime() - cur.startsAt.getTime()) / 60_000);
  const startsAt = zonedToUtc(b.date ?? was.date, b.startTime ?? was.time);
  const endsAt = addMinutes(startsAt, b.durationMin ?? curDur);
  const roomId = b.roomId ?? cur.roomId;
  const timeChanged = startsAt.getTime() !== cur.startsAt.getTime() || endsAt.getTime() !== cur.endsAt.getTime();
  const roomChanged = roomId !== cur.roomId;

  // kembaran di acara pasangan ikut berubah (selama masih sama dengan sesi ini sebelum diubah)
  const pair = await pairFor(u.tenantId, ev);
  const twin = pair?.usable ? pair.sessions.find((x) => isTwinSlot(cur, x)) ?? null : null;
  const ids = [rid, ...(twin ? [twin.id] : [])];
  const selfSources = ids.map((id) => ({ sourceType: "REHEARSAL", sourceId: id }));

  if (timeChanged) {
    const limit = rehearsalLimit(ev.startsAt, pair?.startsAt);
    const timing = rehearsalTimingError(startsAt, limit, fmtLocal(limit));
    if (timing) throw badRequest(timing);
  }
  if (roomChanged) await assertRoomUsable(u.tenantId, roomId);
  if (timeChanged || roomChanged) await assertRoomFree(u.tenantId, roomId, startsAt, endsAt, selfSources);

  let conf = new Map<string, PersonConflict[]>();
  const people = await requiredPeople(eventId);
  const pairPeople = twin ? await requiredPeople(pair!.id) : [];
  const everyone = [...people, ...pairPeople.filter((p) => !people.some((x) => x.personId === p.personId))];
  if (timeChanged) {
    conf = await personConflicts(u.tenantId, everyone.map((p) => p.personId), [{ startsAt, endsAt }], { currentEventId: eventId, excludeSource: selfSources });
    if (conf.size) {
      if (!b.override) throw conflictError(everyone, conf, u, "Waktu latihan baru");
      requirePermission(u, "booking.override");
    }
  }

  await translateOverlap(
    () =>
      prisma.$transaction(async (tx) => {
        const data = { startsAt, endsAt, roomId, note: b.note === undefined ? undefined : b.note };
        await tx.rehearsalSession.update({ where: { id: rid }, data });
        if (twin) await tx.rehearsalSession.update({ where: { id: twin.id }, data });
        if (timeChanged || roomChanged) {
          await releaseBookings(tx, { sourceType: "REHEARSAL", sourceId: { in: ids }, resourceType: "ROOM" });
          await bookRoom(tx, { tenantId: u.tenantId, roomId, startsAt, endsAt, sourceType: "REHEARSAL", sourceId: rid });
        }
        if (timeChanged) {
          await tx.booking.updateMany({ where: { sourceType: "REHEARSAL", sourceId: { in: ids }, resourceType: "PERSON", deletedAt: null }, data: { startsAt, endsAt } });
          if (conf.size) await tx.booking.updateMany({ where: { sourceType: "REHEARSAL", sourceId: { in: ids }, resourceType: "PERSON", deletedAt: null, resourceId: { in: [...conf.keys()] } }, data: { isOverride: true } });
        }
      }),
    "Waktu baru bentrok untuk ruangan atau peserta wajib.",
  );
  if (conf.size && b.override) {
    await audit({ tenantId: u.tenantId, userId: u.userId, action: "booking.override", entity: "RehearsalSession", entityId: rid, reason: b.override.reason, payload: { eventId } });
  }
  return listRehearsals(u.tenantId, eventId);
}

export async function deleteRehearsal(u: AuthUser, eventId: string, rid: string) {
  const ev = await loadEvent(u.tenantId, eventId);
  const cur = await prisma.rehearsalSession.findFirst({ where: { id: rid, eventId, tenantId: u.tenantId, deletedAt: null } });
  if (!cur) throw notFound("Sesi latihan");
  const pair = await pairFor(u.tenantId, ev);
  const twin = pair?.usable ? pair.sessions.find((x) => isTwinSlot(cur, x)) ?? null : null; // latihan yang sama di pasangan ikut dihapus
  const ids = [rid, ...(twin ? [twin.id] : [])];
  await prisma.$transaction(async (tx) => {
    await releaseBookings(tx, { sourceType: "REHEARSAL", sourceId: { in: ids } });
    await tx.rehearsalSession.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
  });
  return listRehearsals(u.tenantId, eventId);
}

/**
 * Samakan sesi latihan acara ini dengan acara sumber (pasangannya di hari yang sama): sesi sumber yang belum punya kembaran di sini
 * dibuat dengan jam dan ruangan yang sama. Ruangan tidak dipesan lagi (sudah dipesan sesi sumber); jam peserta wajib di acara ini
 * dikunci, dan yang sudah terkunci lewat kembarannya ditandai override seperti pada latihan kembar biasa.
 * Sesi yang akan membuat peserta wajib bentrok dengan hal lain dilewati dan dilaporkan; sisanya tetap dibuat.
 */
export async function mirrorSessionsFrom(u: AuthUser, targetEventId: string, sourceEventId: string) {
  const [source, mine] = await Promise.all([
    prisma.rehearsalSession.findMany({ where: { eventId: sourceEventId, tenantId: u.tenantId, deletedAt: null }, orderBy: { seq: "asc" } }),
    prisma.rehearsalSession.findMany({ where: { eventId: targetEventId, tenantId: u.tenantId, deletedAt: null } }),
  ]);
  const missing = source.filter((s) => !mine.some((m) => isTwinSlot(m, s)));
  const out = { added: 0, skipped: [] as string[] };
  if (!missing.length) return out;
  const people = await requiredPeople(targetEventId);
  const last = await prisma.rehearsalSession.aggregate({ where: { eventId: targetEventId }, _max: { seq: true } }); // termasuk yang sudah dihapus (unique eventId+seq)
  let seq = last._max.seq ?? 0;
  for (const s of missing) {
    const conf = await personConflicts(u.tenantId, people.map((p) => p.personId), [{ startsAt: s.startsAt, endsAt: s.endsAt }], { currentEventId: targetEventId, excludeSource: { sourceType: "REHEARSAL", sourceId: s.id } });
    if (conf.size) {
      out.skipped.push(`Latihan ${fmtLocal(s.startsAt)} tidak dibuat: ${people.filter((p) => conf.has(p.personId)).map((p) => `${p.name} bentrok (${conf.get(p.personId)!.map((c) => c.label).join(", ")})`).join("; ")}.`);
      continue;
    }
    const booked = new Set((await prisma.booking.findMany({ where: { tenantId: u.tenantId, resourceType: "PERSON", sourceType: "REHEARSAL", sourceId: s.id, deletedAt: null }, select: { resourceId: true } })).map((b) => b.resourceId));
    seq += 1;
    await translateOverlap(
      () =>
        prisma.$transaction(async (tx) => {
          const t = await tx.rehearsalSession.create({ data: { tenantId: u.tenantId, eventId: targetEventId, seq, startsAt: s.startsAt, endsAt: s.endsAt, roomId: s.roomId, note: s.note } });
          if (people.length) {
            await tx.booking.createMany({
              data: people.map((p) => ({
                tenantId: u.tenantId, resourceType: "PERSON", resourceId: p.personId, startsAt: s.startsAt, endsAt: s.endsAt, sourceType: "REHEARSAL", sourceId: t.id, assignmentId: p.assignmentId, isOverride: p.dup || booked.has(p.personId),
              })),
            });
          }
        }),
      "Latihan bentrok: salah satu peserta wajib baru saja terpakai. Muat ulang lalu coba lagi.",
    );
    out.added++;
  }
  return out;
}

/** Aktif/nonaktifkan "wajib latihan" untuk satu kursi. Mengaktifkan akan mengunci jam semua sesi latihan untuk orangnya. */
export async function setSeatRequired(u: AuthUser, eventId: string, assignmentId: string, required: boolean, ov?: { reason: string }) {
  const ev = await loadEvent(u.tenantId, eventId);
  const seat = await prisma.eventAssignment.findFirst({ where: { id: assignmentId, eventId, tenantId: u.tenantId }, include: { person: true, ministry: { include: { teamType: true } } } });
  if (!seat) throw notFound("Kursi");
  requireTeamAccess(u, seat.teamTypeId);
  if (seat.rehearsalRequired === required) return { changed: false };

  const sessions = await prisma.rehearsalSession.findMany({ where: { eventId, deletedAt: null } });
  // latihan kembar di acara pasangan adalah latihan yang sama: bukan bentrok, dan jam orang yang sudah terkunci lewat kembaran ditandai override
  const tw = sessions.length ? await twinInfo(u.tenantId, ev) : { pairId: null, twins: new Map<string, string>() };
  const twinSources = [...tw.twins.values()].map((id) => ({ sourceType: "REHEARSAL", sourceId: id }));
  const shadowed = new Set<string>();
  if (required && seat.personId && twinSources.length) {
    const rows = await prisma.booking.findMany({ where: { tenantId: u.tenantId, resourceType: "PERSON", resourceId: seat.personId, sourceType: "REHEARSAL", sourceId: { in: [...tw.twins.values()] }, deletedAt: null }, select: { sourceId: true } });
    const have = new Set(rows.map((r) => r.sourceId));
    for (const [mine, twin] of tw.twins) if (have.has(twin)) shadowed.add(mine);
  }
  let found: PersonConflict[] = [];
  let foundAll: PersonConflict[] = [];
  if (required && seat.personId && sessions.length) {
    const ranges: Range[] = sessions.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt }));
    foundAll = (await personConflicts(u.tenantId, [seat.personId], ranges, { excludeAssignmentId: assignmentId, currentEventId: eventId, ...(twinSources.length ? { excludeSource: twinSources } : {}) })).get(seat.personId) ?? [];
    // kursi lain milik orang yang sama yang boleh dirangkap (PIC dan Usher) bukan bentrok
    const mine = await prisma.eventAssignment.findMany({ where: { eventId, personId: seat.personId, id: { not: assignmentId } }, include: { ministry: { include: { teamType: true } } } });
    const allowed = new Set(mine.filter((o) => judgePair({ teamName: seat.ministry.teamType.name, ministryName: seat.ministry.name }, { teamName: o.ministry.teamType.name, ministryName: o.ministry.name }, seat.person!.name).kind === "ALLOWED").map((o) => o.id));
    found = foundAll.filter((c) => !(c.assignmentId && allowed.has(c.assignmentId)));
    if (found.length) {
      if (!ov) {
        throw new ApiError(409, "REHEARSAL_CONFLICT", `${seat.person!.name} bentrok dengan latihan: ${found.map((c) => c.label).join(", ")}.`, {
          conflicts: found.map((c) => c.label), canOverride: can(u, "booking.override"),
        });
      }
      requirePermission(u, "booking.override");
    }
  }

  await translateOverlap(
    () =>
      prisma.$transaction(async (tx) => {
        await tx.eventAssignment.update({ where: { id: assignmentId }, data: { rehearsalRequired: required } });
        if (!seat.personId) return;
        if (required) {
          await tx.booking.createMany({
            data: sessions.map((s) => ({
              tenantId: u.tenantId, resourceType: "PERSON", resourceId: seat.personId!, startsAt: s.startsAt, endsAt: s.endsAt, sourceType: "REHEARSAL", sourceId: s.id, assignmentId,
              isOverride: shadowed.has(s.id) || foundAll.some((c) => rangesOverlap(c, s)),
            })),
          });
        } else {
          await releaseBookings(tx, { assignmentId, sourceType: "REHEARSAL" });
          await promoteOrphanOverrides(tx, u.tenantId, seat.personId, tw.pairId ? [eventId, tw.pairId] : eventId);
        }
      }),
    `${seat.person?.name ?? "Orang ini"} bentrok dengan salah satu jam latihan.`,
  );
  if (found.length && ov) {
    await audit({ tenantId: u.tenantId, userId: u.userId, action: "booking.override", entity: "EventAssignment", entityId: assignmentId, reason: ov.reason, payload: { eventId, rehearsal: true } });
  }
  return { changed: true };
}

/**
 * Tombol massal: ubah "wajib latihan" untuk semua kursi di satu tim (atau satu posisi, atau seluruh acara).
 * Kursi yang akan bentrok dilewati dan dilaporkan, sisanya tetap berubah.
 */
export async function bulkSetRequired(u: AuthUser, eventId: string, b: z.infer<typeof bulkRequiredBody>) {
  await loadEvent(u.tenantId, eventId);
  const scope = teamScope(u);
  if (b.teamTypeId && scope !== null) requireTeamAccess(u, b.teamTypeId);

  let seats = await prisma.eventAssignment.findMany({
    where: { eventId, tenantId: u.tenantId, ...(b.teamTypeId ? { teamTypeId: b.teamTypeId } : {}), ...(b.ministryId ? { ministryId: b.ministryId } : {}) },
    include: { ministry: true, person: true },
    orderBy: [{ sortOrder: "asc" }, { slotNo: "asc" }],
  });
  if (scope !== null) seats = seats.filter((s) => scope.includes(s.teamTypeId)); // Admin Tim hanya timnya

  let updated = 0, unchanged = 0;
  const blocked: { assignmentId: string; label: string; person: string | null; reason: string }[] = [];
  for (const s of seats) {
    try {
      const r = await setSeatRequired(u, eventId, s.id, b.required);
      if (r.changed) updated++; else unchanged++;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) blocked.push({ assignmentId: s.id, label: seatLabel(s, seats, s.ministryId), person: s.person?.name ?? null, reason: e.message });
      else throw e;
    }
  }
  return { updated, unchanged, blocked };
}
