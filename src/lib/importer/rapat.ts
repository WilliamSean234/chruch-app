import { randomUUID } from "node:crypto";
import { addMinutes, zonedToUtc } from "../time";
import { isYesNo, k, minutesOf, parseDate, parseTime, yes, type Ctx, type Row } from "./common";
import { activeCount, type GroupState, type Grp } from "./groups";
import { fmtRange, type Ledger } from "./ledger";
import type { MasterState, RoomRec } from "./master";

/**
 * Rapat kelompok dari Excel (sheet Rapat). Murni (tanpa database): rapat yang sudah ada dan pemakaian ruangan dari database
 * dimuat lebih dulu (groupsIO.ts) dan diberikan lewat `existing` dan `ledger`.
 *
 * Aturan privasi sama dengan di aplikasi untuk Penjadwal yang bukan anggota kelompok: seluruh anggota diundang;
 * nama peserta tertentu, tamu, dan tautan lampiran adalah isi rapat dan hanya bisa diatur anggota kelompok lewat aplikasi.
 */
export type Mtg = {
  row: number; id: string; group: Grp; title: string; date: string; startsAt: Date; endsAt: Date; room: RoomRec;
  showTopic: boolean; showAttendees: boolean; ok: boolean;
};

export const meetingKey = (groupId: string, title: string, date: string) => `${groupId}|${k(title)}|${date}`;

export function stageMeetings(ctx: Ctx, st: MasterState, gs: GroupState, rows: Row[], ledger: Ledger, existing: Set<string>): Mtg[] {
  const { rep } = ctx;
  const { M } = st;
  const plan: Mtg[] = [];
  const seen = new Set<string>();

  for (const r of rows) {
    rep.seen("Rapat");
    const errs: string[] = [];
    const gname = r.v.group.trim();
    const g = gname ? gs.groups.get(k(gname)) : undefined;
    if (!gname) errs.push("Kelompok wajib diisi.");
    else if (!g || g.deleted) errs.push(`Kelompok "${gname}" belum ada (cek ejaan atau isi sheet KelompokRapat).`);
    const title = r.v.title.trim().replace(/\s+/g, " ");
    if (!title) errs.push("Judul atau topik rapat wajib diisi.");
    if (title.length > 120) errs.push("Judul terlalu panjang (maks 120 huruf).");
    const date = parseDate(r.v.date);
    if (!date) errs.push(`Tanggal "${r.v.date}" tidak terbaca (contoh 2026-12-08).`);
    const start = parseTime(r.v.start);
    if (!start) errs.push(`Jam mulai "${r.v.start}" tidak terbaca (contoh 19:00).`);
    const end = parseTime(r.v.end);
    if (!end) errs.push(`Jam selesai "${r.v.end}" tidak terbaca.`);
    let dur = 0;
    if (start && end) {
      dur = minutesOf(end) - minutesOf(start);
      if (dur <= 0) errs.push("Jam selesai harus setelah jam mulai.");
      else if (dur > 720) errs.push("Rapat paling lama 12 jam.");
    }
    const room = r.v.room ? M.rooms.get(k(r.v.room)) : undefined;
    if (!r.v.room) errs.push("Ruangan wajib diisi.");
    else if (!room || room.deleted) errs.push(`Ruangan "${r.v.room}" belum ada.`);
    else if (!room.active) errs.push(`Ruangan ${room.name} sedang nonaktif.`);
    for (const v of [r.v.showTopic, r.v.showAttendees]) if (!isYesNo(v)) errs.push(`Kolom tampil di kalender umum: isi Ya atau Tidak (isinya "${v}"; kosong = Tidak).`);
    if (errs.length) { rep.err("Rapat", r.n, [...new Set(errs)].join(" ")); continue; }

    const key = meetingKey(g!.id, title, date!);
    if (existing.has(key)) { rep.skip("Rapat", r.n, `Rapat "${title}" kelompok ${g!.name} tanggal ${date} sudah ada di sistem.`); continue; }
    if (seen.has(key)) { rep.err("Rapat", r.n, `Rapat "${title}" kelompok ${g!.name} tanggal ${date} muncul dua kali di file.`); continue; }
    seen.add(key);
    const startsAt = zonedToUtc(date!, start!);
    plan.push({
      row: r.n, id: randomUUID(), group: g!, title, date: date!, startsAt, endsAt: addMinutes(startsAt, dur), room: room!,
      showTopic: yes(r.v.showTopic, false), showAttendees: yes(r.v.showAttendees, false), ok: false,
    });
  }

  // Bentrok ruangan (database + isi file), urut waktu. Rapat hanya memakai ruangan; orang tidak dipesan.
  plan.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.row - b.row);
  for (const m of plan) {
    const hit = ledger.clash(`ROOM:${m.room.id}`, m.startsAt, m.endsAt);
    if (hit) { rep.err("Rapat", m.row, `Ruangan ${m.room.name} sudah dipakai: ${hit}.`); continue; }
    ledger.add(`ROOM:${m.room.id}`, m.startsAt, m.endsAt, `Rapat ${m.group.name}: ${m.title}, ${fmtRange(m.startsAt, m.endsAt)}`);
    m.ok = true;
    rep.ok("Rapat");
    if (activeCount(m.group) === 0) rep.note("Rapat", m.row, `Kelompok ${m.group.name} belum punya anggota, jadi belum ada yang diundang.`);
  }
  return plan.filter((m) => m.ok);
}
