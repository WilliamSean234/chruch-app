import { randomUUID } from "node:crypto";
import { prisma } from "../prisma";
import { nameKey } from "../names";
import { nextDocNumber } from "../docNumber";
import { addMinutes, localParts, zonedToUtc } from "../time";
import { k, minutesOf, parseDate, parseInt0, parseTime, type Ctx, type Row } from "./common";
import { findMinistry, type MasterState, type MinRec, type PersonRec, type RoomRec } from "./master";
import { Ledger, fmtRange } from "./ledger";

type Seat = { count: number; rehearsal: boolean };
type Assign = { row: number; ministry: MinRec; slotNo: number; person: PersonRec; id: string; ok: boolean };
type Reh = { row: number; id: string; date: string; start: string; dur: number; roomId: string; note: string | null; startsAt: Date; endsAt: Date; ok: boolean };
type Ev = {
  row: number; id: string; title: string; date: string; startsAt: Date; endsAt: Date; durationMin: number; room: RoomRec;
  mode: "COUNT" | "NAMES"; tplId: string | null; published: boolean;
  seats: Map<string, Seat>; assigns: Assign[]; rehs: Reh[]; dropped?: string;
};
const evKey = (title: string, date: string) => `${k(title)}|${date}`;
export async function stageSchedule(ctx: Ctx, st: MasterState, rows: { Acara: Row[]; Penugasan: Row[]; Latihan: Row[] }, ledger: Ledger = new Ledger()) {
  const { M } = st;
  const { rep, u } = ctx;
  const tenantId = u.tenantId;

  // ── Acara yang sudah ada di database (judul + tanggal sama) dilewati ──
  const dates = rows.Acara.map((r) => parseDate(r.v.date)).filter((x): x is string => !!x).sort();
  const existing = new Set<string>();
  if (dates.length) {
    const from = zonedToUtc(dates[0], "00:00");
    const to = addMinutes(zonedToUtc(dates[dates.length - 1], "23:59"), 1);
    const evs = await prisma.event.findMany({ where: { tenantId, deletedAt: null, status: { not: "CANCELLED" }, startsAt: { gte: from, lt: to } }, select: { title: true, startsAt: true } });
    for (const e of evs) existing.add(evKey(e.title, localParts(e.startsAt).date));
  }

  // ── Fase A: sheet Acara ──
  const events = new Map<string, Ev>();
  for (const r of rows.Acara) {
    rep.seen("Acara");
    const title = r.v.title.trim().replace(/\s+/g, " ");
    const errs: string[] = [];
    if (!title) errs.push("Judul wajib diisi.");
    if (title.length > 120) errs.push("Judul terlalu panjang (maks 120 huruf).");
    const date = parseDate(r.v.date);
    if (!date) errs.push(`Tanggal "${r.v.date}" tidak terbaca (contoh 2026-12-06).`);
    const start = parseTime(r.v.start);
    if (!start) errs.push(`Jam mulai "${r.v.start}" tidak terbaca (contoh 09:30).`);
    const end = parseTime(r.v.end);
    if (!end) errs.push(`Jam selesai "${r.v.end}" tidak terbaca.`);
    let dur = 0;
    if (start && end) {
      dur = minutesOf(end) - minutesOf(start);
      if (dur < 15 || dur > 720) errs.push("Jam selesai harus 15 menit sampai 12 jam setelah jam mulai.");
    }
    const room = r.v.room ? M.rooms.get(k(r.v.room)) : undefined;
    if (!r.v.room) errs.push("Ruangan wajib diisi.");
    else if (!room || room.deleted) errs.push(`Ruangan "${r.v.room}" belum ada.`);
    else if (!room.active) errs.push(`Ruangan ${room.name} sedang nonaktif.`);
    const tpl = r.v.tpl ? M.templates.get(k(r.v.tpl)) : undefined;
    if (r.v.tpl && (!tpl || tpl.deleted)) errs.push(`Template "${r.v.tpl}" belum ada.`);
    const sk = k(r.v.status);
    if (sk && !["draft", "terbit"].includes(sk)) errs.push(`Status harus Draft atau Terbit (isinya "${r.v.status}").`);
    const mk = k(r.v.mode);
    if (mk && !["jumlah saja", "per nama"].includes(mk)) errs.push(`Mode kehadiran harus "Jumlah saja" atau "Per nama".`);
    if (errs.length) { rep.err("Acara", r.n, errs.join(" ")); continue; }

    const key = evKey(title, date!);
    if (existing.has(key)) { rep.skip("Acara", r.n, `Acara "${title}" tanggal ${date} sudah ada di sistem.`); events.set(key, { row: r.n, id: "", title, date: date!, startsAt: new Date(0), endsAt: new Date(0), durationMin: 0, room: room!, mode: "COUNT", tplId: null, published: false, seats: new Map(), assigns: [], rehs: [], dropped: "EXISTING" }); continue; }
    if (events.has(key)) { rep.err("Acara", r.n, `Acara "${title}" tanggal ${date} muncul dua kali di file.`); continue; }
    const startsAt = zonedToUtc(date!, start!);
    const seats = new Map<string, Seat>();
    if (tpl) for (const [mid, s] of tpl.slots) seats.set(mid, { ...s });
    events.set(key, {
      row: r.n, id: randomUUID(), title, date: date!, startsAt, endsAt: addMinutes(startsAt, dur), durationMin: dur, room: room!,
      mode: mk ? (mk === "per nama" ? "NAMES" : "COUNT") : tpl?.mode ?? "COUNT", tplId: tpl?.id ?? null, published: sk === "terbit", seats, assigns: [], rehs: [],
    });
  }

  const evOf = (sheet: string, r: Row, title: string, dateRaw: string): Ev | undefined => {
    const date = parseDate(dateRaw);
    if (!title || !date) { rep.err(sheet, r.n, !title ? "Judul acara wajib diisi." : `Tanggal acara "${dateRaw}" tidak terbaca.`); return; }
    const ev = events.get(evKey(title, date));
    if (!ev) { rep.err(sheet, r.n, `Acara "${title}" tanggal ${date} tidak ada di sheet Acara.`); return; }
    if (ev.dropped === "EXISTING") { rep.skip(sheet, r.n, `Acara "${title}" tanggal ${date} sudah ada di sistem, jadi baris ini dilewati.`); return; }
    return ev;
  };

  // ── Fase B: sheet Penugasan ──
  const usedPerson = new Map<string, Set<string>>(); // eventId → personId
  const usedSeat = new Map<string, Set<string>>(); // eventId → "ministryId:slot"
  for (const r of rows.Penugasan) {
    rep.seen("Penugasan");
    const ev = evOf("Penugasan", r, r.v.title.trim(), r.v.date);
    if (!ev) continue;
    const errs: string[] = [];
    const f = r.v.ministry ? findMinistry(M, r.v.ministry) : { err: "Pelayanan wajib diisi." };
    if (f.err) errs.push(f.err);
    const person = r.v.person ? M.persons.get(nameKey(r.v.person)) : undefined;
    if (!r.v.person) errs.push("Nama orang wajib diisi."); else if (!person) errs.push(`"${r.v.person}" belum ada di data Orang.`);
    let slot = 0;
    if (r.v.seat) { const s = parseInt0(r.v.seat); if (s === null || s < 1 || s > 10) errs.push("Kursi ke- harus 1–10."); else slot = s; }
    if (errs.length) { rep.err("Penugasan", r.n, errs.join(" ")); continue; }
    const min = f.rec!;
    const seatSet = usedSeat.get(ev.id) ?? new Set<string>();
    const personSet = usedPerson.get(ev.id) ?? new Set<string>();
    if (personSet.has(person!.id)) { rep.err("Penugasan", r.n, `${person!.name} sudah punya kursi lain di acara ini. Satu orang satu kursi per acara.`); continue; }
    if (!slot) { slot = 1; while (seatSet.has(`${min.id}:${slot}`)) slot++; }
    if (slot > 10) { rep.err("Penugasan", r.n, `Kursi ${min.name} melebihi 10.`); continue; }
    if (seatSet.has(`${min.id}:${slot}`)) { rep.err("Penugasan", r.n, `Kursi ${min.name} ke-${slot} sudah terisi di baris lain.`); continue; }
    seatSet.add(`${min.id}:${slot}`); personSet.add(person!.id);
    usedSeat.set(ev.id, seatSet); usedPerson.set(ev.id, personSet);
    const cur = ev.seats.get(min.id);
    if (!cur) ev.seats.set(min.id, { count: slot, rehearsal: min.rehearsal });
    else if (cur.count < slot) cur.count = slot;
    ev.assigns.push({ row: r.n, ministry: min, slotNo: slot, person: person!, id: randomUUID(), ok: false });
    if (!person!.ministryIds.has(min.id)) rep.note("Penugasan", r.n, `${person!.name} belum tercatat bisa ${min.name} (tetap dijadwalkan).`);
  }

  // ── Fase C: sheet Latihan ──
  for (const r of rows.Latihan) {
    rep.seen("Latihan");
    const ev = evOf("Latihan", r, r.v.title.trim(), r.v.date);
    if (!ev) continue;
    const errs: string[] = [];
    const rdate = parseDate(r.v.rdate);
    if (!rdate) errs.push(`Tanggal latihan "${r.v.rdate}" tidak terbaca.`);
    const start = parseTime(r.v.start);
    if (!start) errs.push(`Jam mulai "${r.v.start}" tidak terbaca.`);
    const dur = parseInt0(r.v.dur);
    if (dur === null || dur < 15 || dur > 480) errs.push("Durasi latihan harus 15–480 menit.");
    const room = r.v.room ? M.rooms.get(k(r.v.room)) : undefined;
    if (!r.v.room) errs.push("Ruangan wajib diisi."); else if (!room || room.deleted) errs.push(`Ruangan "${r.v.room}" belum ada.`); else if (!room.active) errs.push(`Ruangan ${room.name} sedang nonaktif.`);
    if (r.v.note.length > 200) errs.push("Catatan terlalu panjang (maks 200 huruf).");
    if (errs.length) { rep.err("Latihan", r.n, errs.join(" ")); continue; }
    const startsAt = zonedToUtc(rdate!, start!);
    ev.rehs.push({ row: r.n, id: randomUUID(), date: rdate!, start: start!, dur: dur!, roomId: room!.id, note: r.v.note || null, startsAt, endsAt: addMinutes(startsAt, dur!), ok: false });
  }

  // ── Fase D: bentrok ruangan dan orang (database + isi file), urut waktu ──
  const plan = [...events.values()].filter((e) => e.dropped !== "EXISTING").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.row - b.row);
  if (plan.length) {
    const minS = new Date(Math.min(...plan.flatMap((e) => [e.startsAt, ...e.rehs.map((x) => x.startsAt)]).map((d) => d.getTime())));
    const maxE = new Date(Math.max(...plan.flatMap((e) => [e.endsAt, ...e.rehs.map((x) => x.endsAt)]).map((d) => d.getTime())));
    const roomIds = [...new Set(plan.flatMap((e) => [e.room.id, ...e.rehs.map((x) => x.roomId)]))].filter((id) => ![...M.rooms.values()].some((r) => r.id === id && r.isNew));
    const personIds = [...new Set(plan.flatMap((e) => e.assigns.map((a) => a.person.id)))].filter((id) => ![...M.persons.values()].some((p) => p.id === id && p.isNew));
    const rows2 = await prisma.booking.findMany({
      where: {
        tenantId, deletedAt: null, isOverride: false, startsAt: { lt: maxE }, endsAt: { gt: minS },
        OR: [{ resourceType: "ROOM", resourceId: { in: roomIds } }, { resourceType: "PERSON", resourceId: { in: personIds } }],
      },
    });
    const evIds = [...new Set(rows2.filter((b) => b.sourceType === "EVENT").map((b) => b.sourceId))];
    const rehIds = [...new Set(rows2.filter((b) => b.sourceType === "REHEARSAL").map((b) => b.sourceId))];
    const [evRows, rehRows] = await Promise.all([
      evIds.length ? prisma.event.findMany({ where: { id: { in: evIds } }, select: { id: true, title: true, number: true } }) : [],
      rehIds.length ? prisma.rehearsalSession.findMany({ where: { id: { in: rehIds } }, select: { id: true, event: { select: { title: true } } } }) : [],
    ]);
    const evName = new Map(evRows.map((e) => [e.id, `${e.title} (${e.number})`]));
    const rehName = new Map(rehRows.map((x) => [x.id, `Latihan ${x.event.title}`]));
    for (const b of rows2) {
      const name = (b.sourceType === "EVENT" ? evName.get(b.sourceId) : rehName.get(b.sourceId)) ?? "jadwal lain";
      ledger.add(`${b.resourceType}:${b.resourceId}`, b.startsAt, b.endsAt, `${name}, ${fmtRange(b.startsAt, b.endsAt)}`);
    }
  }

  for (const ev of plan) {
    const gone = (msg: string) => {
      ev.dropped = msg;
      rep.err("Acara", ev.row, msg);
      for (const a of ev.assigns) rep.err("Penugasan", a.row, `Acara "${ev.title}" tidak diimpor: ${msg}`);
      for (const h of ev.rehs) rep.err("Latihan", h.row, `Acara "${ev.title}" tidak diimpor: ${msg}`);
    };
    const roomHit = ledger.clash(`ROOM:${ev.room.id}`, ev.startsAt, ev.endsAt);
    if (roomHit) { gone(`Ruangan ${ev.room.name} sudah dipakai: ${roomHit}.`); continue; }
    ledger.add(`ROOM:${ev.room.id}`, ev.startsAt, ev.endsAt, `${ev.title}, ${fmtRange(ev.startsAt, ev.endsAt)}`);
    rep.ok("Acara");

    for (const a of ev.assigns.sort((x, y) => x.row - y.row)) {
      const hit = ledger.clash(`PERSON:${a.person.id}`, ev.startsAt, ev.endsAt);
      if (hit) { rep.err("Penugasan", a.row, `${a.person.name} sudah terjadwal di tempat lain pada jam itu: ${hit}.`); continue; }
      ledger.add(`PERSON:${a.person.id}`, ev.startsAt, ev.endsAt, `${ev.title}, ${fmtRange(ev.startsAt, ev.endsAt)}`);
      a.ok = true;
      rep.ok("Penugasan");
    }

    for (const h of ev.rehs.sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime() || x.row - y.row)) {
      const rHit = ledger.clash(`ROOM:${h.roomId}`, h.startsAt, h.endsAt);
      if (rHit) { rep.err("Latihan", h.row, `Ruangan untuk latihan sudah dipakai: ${rHit}.`); continue; }
      const needed = ev.assigns.filter((a) => a.ok && ev.seats.get(a.ministry.id)?.rehearsal);
      const pHit = needed.map((a) => ({ a, hit: ledger.clash(`PERSON:${a.person.id}`, h.startsAt, h.endsAt) })).find((x) => x.hit);
      if (pHit) { rep.err("Latihan", h.row, `${pHit.a.person.name} (wajib latihan) sudah terjadwal di tempat lain pada jam itu: ${pHit.hit}.`); continue; }
      ledger.add(`ROOM:${h.roomId}`, h.startsAt, h.endsAt, `Latihan ${ev.title}, ${fmtRange(h.startsAt, h.endsAt)}`);
      for (const a of needed) ledger.add(`PERSON:${a.person.id}`, h.startsAt, h.endsAt, `Latihan ${ev.title}, ${fmtRange(h.startsAt, h.endsAt)}`);
      h.ok = true;
      rep.ok("Latihan");
    }
  }
  return plan.filter((e) => !e.dropped);
}

type Plan = Awaited<ReturnType<typeof stageSchedule>>;

/** Simpan acara satu per satu (satu transaksi per acara). Acara yang gagal ditandai, yang lain tetap jalan. */
export async function writeSchedule(ctx: Ctx, st: MasterState, plan: Plan) {
  const { rep, u } = ctx;
  const teamOf = new Map<string, string>();
  for (const list of st.M.ministries.values()) for (const m of list) teamOf.set(m.id, m.teamId);

  for (const ev of plan) {
    try {
      const number = await nextDocNumber(u.tenantId, "EV", ev.startsAt);
      // kursi: urut menurut posisi, nomor kursi 1..count
      const seatRows: { id: string; ministryId: string; teamTypeId: string; slotNo: number; personId: string | null; rehearsalRequired: boolean; sortOrder: number }[] = [];
      const byKey = new Map(ev.assigns.filter((a) => a.ok).map((a) => [`${a.ministry.id}:${a.slotNo}`, a]));
      let order = 0;
      for (const [ministryId, s] of ev.seats) {
        for (let i = 1; i <= s.count; i++) {
          const a = byKey.get(`${ministryId}:${i}`);
          seatRows.push({ id: a?.id ?? randomUUID(), ministryId, teamTypeId: teamOf.get(ministryId)!, slotNo: i, personId: a?.person.id ?? null, rehearsalRequired: s.rehearsal, sortOrder: order++ });
        }
      }
      const teamIds = [...new Set(seatRows.map((s) => s.teamTypeId))];
      const okRehs = ev.rehs.filter((h) => h.ok).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      const required = seatRows.filter((s) => s.personId && s.rehearsalRequired);

      await prisma.$transaction(
        async (tx) => {
          await tx.event.create({
            data: {
              id: ev.id, tenantId: u.tenantId, number, templateId: ev.tplId, title: ev.title, startsAt: ev.startsAt, endsAt: ev.endsAt, roomId: ev.room.id,
              status: ev.published ? "PUBLISHED" : "DRAFT", publishedAt: ev.published ? new Date() : null, attendanceMode: ev.mode, createdById: u.userId,
              teams: { create: teamIds.map((teamTypeId) => ({ teamTypeId })) },
              assignments: { create: seatRows.map((s) => ({ id: s.id, tenantId: u.tenantId, teamTypeId: s.teamTypeId, ministryId: s.ministryId, slotNo: s.slotNo, personId: s.personId, rehearsalRequired: s.rehearsalRequired, sortOrder: s.sortOrder })) },
            },
          });
          const bookings: { tenantId: string; resourceType: string; resourceId: string; startsAt: Date; endsAt: Date; sourceType: string; sourceId: string; assignmentId?: string }[] = [
            { tenantId: u.tenantId, resourceType: "ROOM", resourceId: ev.room.id, startsAt: ev.startsAt, endsAt: ev.endsAt, sourceType: "EVENT", sourceId: ev.id },
          ];
          for (const s of seatRows) if (s.personId) bookings.push({ tenantId: u.tenantId, resourceType: "PERSON", resourceId: s.personId, startsAt: ev.startsAt, endsAt: ev.endsAt, sourceType: "EVENT", sourceId: ev.id, assignmentId: s.id });
          okRehs.forEach((h) => {
            bookings.push({ tenantId: u.tenantId, resourceType: "ROOM", resourceId: h.roomId, startsAt: h.startsAt, endsAt: h.endsAt, sourceType: "REHEARSAL", sourceId: h.id });
            for (const s of required) bookings.push({ tenantId: u.tenantId, resourceType: "PERSON", resourceId: s.personId!, startsAt: h.startsAt, endsAt: h.endsAt, sourceType: "REHEARSAL", sourceId: h.id, assignmentId: s.id });
          });
          if (okRehs.length) {
            await tx.rehearsalSession.createMany({ data: okRehs.map((h, i) => ({ id: h.id, tenantId: u.tenantId, eventId: ev.id, seq: i + 1, startsAt: h.startsAt, endsAt: h.endsAt, roomId: h.roomId, note: h.note })) });
          }
          await tx.booking.createMany({ data: bookings });
        },
        { timeout: 60_000, maxWait: 20_000 },
      );
    } catch (e) {
      const msg = /exclusion|23P01|booking_no_overlap/i.test(String((e as Error)?.message)) ? "Jadwal bentrok dengan data lain yang baru masuk." : `Gagal disimpan (${(e as Error)?.message?.split("\n").pop()?.slice(0, 160) ?? "kesalahan server"}).`;
      rep.fail("Acara", ev.row, msg);
      for (const a of ev.assigns) if (a.ok) rep.fail("Penugasan", a.row, `Acara "${ev.title}" gagal disimpan.`);
      for (const h of ev.rehs) if (h.ok) rep.fail("Latihan", h.row, `Acara "${ev.title}" gagal disimpan.`);
    }
  }
}
