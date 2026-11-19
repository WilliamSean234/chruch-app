import { test } from "node:test";
import assert from "node:assert/strict";
import { Report, type Ctx, type Row } from "../src/lib/importer/common";
import { stageGroups, type GroupState } from "../src/lib/importer/groups";
import { stageMeetings, meetingKey } from "../src/lib/importer/rapat";
import { Ledger } from "../src/lib/importer/ledger";
import { zonedToUtc } from "../src/lib/time";
import { nameKey } from "../src/lib/names";
import type { MasterState } from "../src/lib/importer/master";

const row = (n: number, v: Record<string, string>): Row => ({ n, v });
const KG = (n: number, name: string, quorum = "") => row(n, { name, quorum });
const JB = (n: number, group: string, name: string, s = "", w = "", f = "", m = "") => row(n, { group, name, schedule: s, write: w, finalize: f, manage: m });
const AG = (n: number, group: string, person: string, positions = "") => row(n, { group, person, positions });
const RP = (n: number, o: Partial<Record<string, string>> = {}) =>
  row(n, { group: "Majelis", title: "Rapat bulanan", date: "2026-12-08", start: "19:00", end: "21:00", room: "401A", showTopic: "", showAttendees: "", ...o });

function setup() {
  const person = (id: string, name: string) => [nameKey(name), { id, name, key: nameKey(name), isNew: false, cgId: null, hasUser: false, ministryIds: new Set<string>() }] as const;
  const st = {
    M: {
      persons: new Map([person("p1", "Setia Budi"), person("p2", "Maria Susanti"), person("p3", "Daniel")]),
      rooms: new Map([
        ["401a", { id: "r1", name: "401A", isNew: false, active: true }],
        ["ruang tutup", { id: "r2", name: "Ruang Tutup", isNew: false, active: false }],
      ]),
    },
    W: {}, credentials: [],
  } as unknown as MasterState;
  const rep = new Report();
  const ctx: Ctx = { u: { userId: "u", tenantId: "t", personId: null, roles: [], permissions: [] }, apply: false, rep };
  const gs: GroupState = { groups: new Map() };
  const sheet = (key: string) => rep.get(key);
  return { st, ctx, gs, rep, sheet };
}
const NONE = { KelompokRapat: [], JabatanKelompok: [], AnggotaKelompok: [] };

test("kelompok baru: otomatis punya jabatan Anggota, anggota tanpa jabatan jadi Anggota", () => {
  const { st, ctx, gs, sheet } = setup();
  stageGroups(ctx, st, gs, {
    KelompokRapat: [KG(4, "Majelis", "50%")],
    JabatanKelompok: [JB(4, "Majelis", "Ketua", "", "", "Ya", "Ya"), JB(5, "Majelis", "Sekretaris", "Ya", "Ya", "Ya", "")],
    AnggotaKelompok: [AG(4, "Majelis", "Setia Budi", "Ketua, Sekretaris"), AG(5, "Majelis", "Maria Susanti")],
  });
  assert.equal(sheet("KelompokRapat").created, 1);
  assert.equal(sheet("JabatanKelompok").created, 2);
  assert.equal(sheet("AnggotaKelompok").created, 2);
  const g = gs.groups.get("majelis")!;
  assert.equal(g.quorum, 50);
  assert.equal(g.positions.get("anggota")!.sortOrder, 99);
  assert.deepEqual(g.positions.get("ketua")!.caps, { schedule: false, write: false, finalize: true, manage: true });
  assert.equal(g.members.get("p1")!.positionIds.length, 2);
  assert.deepEqual(g.members.get("p2")!.positionIds, [g.positions.get("anggota")!.id]);
});

test("kesalahan dilaporkan per baris dengan alasan yang jelas", () => {
  const { st, ctx, gs, sheet } = setup();
  stageGroups(ctx, st, gs, {
    KelompokRapat: [KG(4, "Majelis", "150"), KG(5, "Pemuda", "abc"), KG(6, "Majelis"), KG(7, "majelis"), KG(8, "")],
    JabatanKelompok: [JB(4, "Tidak Ada", "Ketua"), JB(5, "Majelis", "Ketua", "mungkin"), JB(6, "Majelis", "Ketua"), JB(7, "Majelis", "ketua"), JB(8, "Majelis", "Anggota")],
    AnggotaKelompok: [AG(4, "Majelis", "Orang Asing"), AG(5, "Majelis", "Daniel", "Bendahara"), AG(6, "Majelis", "Daniel"), AG(7, "Majelis", "Daniel")],
  });
  const kr = sheet("KelompokRapat");
  assert.equal(kr.created, 1); // hanya Majelis (baris 6) yang sah
  assert.equal(kr.errors.length, 4); // 150, abc, kembar di file, kosong
  assert.match(kr.errors[0].message, /1 sampai 100/);
  const jb = sheet("JabatanKelompok");
  assert.equal(jb.created, 1); // Ketua baris 6
  assert.ok(jb.errors.some((e) => /belum ada/.test(e.message)));
  assert.ok(jb.errors.some((e) => /Ya atau Tidak/.test(e.message)));
  assert.ok(jb.errors.some((e) => /dua kali/.test(e.message)));
  assert.equal(jb.skipped, 1); // jabatan Anggota otomatis
  const ag = sheet("AnggotaKelompok");
  assert.equal(ag.created, 1); // Daniel baris 6
  assert.ok(ag.errors.some((e) => /belum ada di data Orang/.test(e.message)));
  assert.ok(ag.errors.some((e) => /Bendahara/.test(e.message)));
  assert.ok(ag.errors.some((e) => /dua kali/.test(e.message)));
});

test("kelompok, jabatan, dan anggota yang sudah ada dilewati; anggota yang pernah keluar bergabung kembali", () => {
  const { st, ctx, gs, sheet } = setup();
  const anggota = { id: "pos-a", name: "Anggota", isNew: false, auto: true, sortOrder: 99, caps: { schedule: false, write: false, finalize: false, manage: false } };
  gs.groups.set("majelis", {
    id: "g1", name: "Majelis", isNew: false, deleted: false, quorum: 50, sortOrder: 1,
    positions: new Map([["anggota", anggota]]),
    members: new Map([
      ["p1", { id: "m1", personId: "p1", name: "Setia Budi", isNew: false, left: false, positionIds: ["pos-a"] }],
      ["p2", { id: "m2", personId: "p2", name: "Maria Susanti", isNew: false, left: true, positionIds: [] }],
    ]),
  });
  stageGroups(ctx, st, gs, {
    KelompokRapat: [KG(4, "Majelis", "70")],
    JabatanKelompok: [],
    AnggotaKelompok: [AG(4, "Majelis", "Setia Budi"), AG(5, "Majelis", "Maria Susanti"), AG(6, "Majelis", "Daniel")],
  });
  assert.equal(sheet("KelompokRapat").skipped, 1);
  assert.equal(gs.groups.get("majelis")!.quorum, 50); // tidak diubah
  const ag = sheet("AnggotaKelompok");
  assert.equal(ag.skipped, 1); // Setia
  assert.equal(ag.created, 2); // Maria (kembali) + Daniel
  assert.equal(gs.groups.get("majelis")!.members.get("p2")!.rejoin, true);
});

test("rapat: sah, kembar, sudah ada, bentrok ruangan, dan isian salah", () => {
  const { st, ctx, gs, sheet } = setup();
  stageGroups(ctx, st, gs, { ...NONE, KelompokRapat: [KG(4, "Majelis")], AnggotaKelompok: [AG(4, "Majelis", "Setia Budi")] });
  const ledger = new Ledger();
  ledger.add("ROOM:r1", zonedToUtc("2026-12-10", "08:00"), zonedToUtc("2026-12-10", "10:00"), "Ibadah lain (EV-1)");
  const g = gs.groups.get("majelis")!;
  const existing = new Set([meetingKey(g.id, "Rapat lama", "2026-12-15")]);
  const plan = stageMeetings(ctx, st, gs, [
    RP(4),
    RP(5), // kembar dengan baris 4
    RP(6, { title: "Rapat lama", date: "2026-12-15" }), // sudah ada
    RP(7, { title: "Bentrok", date: "2026-12-10", start: "09:00", end: "11:00" }),
    RP(8, { group: "Tidak Ada" }),
    RP(9, { start: "21:00", end: "20:00", title: "Terbalik" }),
    RP(10, { room: "Ruang Tutup", title: "Ruang tutup" }),
    RP(11, { room: "Ruang Hilang", title: "Ruang hilang" }),
    RP(12, { title: "Tampil", showTopic: "Ya", showAttendees: "mungkin", date: "2026-12-20" }),
    RP(13, { title: "Berikut", date: "2026-12-22", showTopic: "Ya" }),
  ], ledger, existing);
  const s = sheet("Rapat");
  assert.equal(plan.length, 2); // baris 4 dan 13
  assert.deepEqual(plan.map((m) => m.row), [4, 13]);
  assert.equal(plan[1].showTopic, true);
  assert.equal(s.skipped, 1);
  const msgs = s.errors.map((e) => `${e.row}:${e.message}`).join("\n");
  assert.match(msgs, /5:.*dua kali/);
  assert.match(msgs, /7:.*sudah dipakai: Ibadah lain/);
  assert.match(msgs, /8:.*belum ada/);
  assert.match(msgs, /9:.*setelah jam mulai/);
  assert.match(msgs, /10:.*nonaktif/);
  assert.match(msgs, /11:.*belum ada/);
  assert.match(msgs, /12:.*Ya atau Tidak/);
});

test("dua rapat dalam file yang bentrok di ruangan sama: yang lebih awal menang", () => {
  const { st, ctx, gs, sheet } = setup();
  stageGroups(ctx, st, gs, { ...NONE, KelompokRapat: [KG(4, "Majelis"), KG(5, "Pemuda")] });
  const plan = stageMeetings(ctx, st, gs, [
    RP(4, { group: "Pemuda", title: "B", start: "19:30", end: "20:30" }),
    RP(5, { group: "Majelis", title: "A", start: "19:00", end: "20:00" }),
  ], new Ledger(), new Set());
  assert.deepEqual(plan.map((m) => m.title), ["A"]);
  assert.match(sheet("Rapat").errors[0].message, /Rapat Majelis: A/);
  // kelompok tanpa anggota mendapat catatan
  assert.equal(sheet("Rapat").notes.length, 1);
});
