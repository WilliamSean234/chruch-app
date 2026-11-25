import { test } from "node:test";
import assert from "node:assert/strict";
import { Report, type Ctx, type Row } from "../src/lib/importer/common";
import { stageGroups, type GroupState } from "../src/lib/importer/groups";
import { nameKey } from "../src/lib/names";
import type { MasterState } from "../src/lib/importer/master";

const row = (n: number, v: Record<string, string>): Row => ({ n, v });
const KG = (n: number, name: string, quorum = "") => row(n, { name, quorum });
const JB = (n: number, group: string, name: string, s = "", w = "", f = "", m = "", seats = "") => row(n, { group, name, seats, schedule: s, write: w, finalize: f, manage: m });
const AG = (n: number, group: string, person: string, positions = "") => row(n, { group, person, positions });

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
  const anggota = { id: "pos-a", name: "Anggota", isNew: false, auto: true, sortOrder: 99, seats: null, caps: { schedule: false, write: false, finalize: false, manage: false } };
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

test("jumlah orang per jabatan: kosong = 1, angka, atau tanpa batas; salah isi ditolak", () => {
  const { st, ctx, gs, sheet } = setup();
  stageGroups(ctx, st, gs, {
    KelompokRapat: [KG(4, "Majelis")],
    JabatanKelompok: [
      JB(4, "Majelis", "Ketua"), JB(5, "Majelis", "Penatua", "", "", "", "", "5"), JB(6, "Majelis", "Seksi Umum", "", "", "", "", "tanpa batas"),
      JB(7, "Majelis", "Humas", "", "", "", "", "0"), JB(8, "Majelis", "Diakon", "", "", "", "", "dua"),
    ],
    AnggotaKelompok: [],
  });
  const g = gs.groups.get("majelis")!;
  assert.equal(g.positions.get("ketua")!.seats, 1);
  assert.equal(g.positions.get("penatua")!.seats, 5);
  assert.equal(g.positions.get("seksi umum")!.seats, null);
  assert.equal(g.positions.get("anggota")!.seats, null);
  assert.equal(sheet("JabatanKelompok").errors.length, 2); // 0 dan "dua"
});

test("jabatan yang penuh menolak anggota berikutnya, termasuk yang diisi di baris sebelumnya", () => {
  const { st, ctx, gs, sheet } = setup();
  stageGroups(ctx, st, gs, {
    KelompokRapat: [KG(4, "Majelis")],
    JabatanKelompok: [JB(4, "Majelis", "Ketua"), JB(5, "Majelis", "Penatua", "", "", "", "", "2")],
    AnggotaKelompok: [AG(4, "Majelis", "Setia Budi", "Ketua, Penatua"), AG(5, "Majelis", "Maria Susanti", "Ketua"), AG(6, "Majelis", "Maria Susanti", "Penatua"), AG(7, "Majelis", "Daniel", "Penatua")],
  });
  const ag = sheet("AnggotaKelompok");
  assert.equal(ag.created, 2); // Setia dan Maria (Penatua)
  assert.equal(ag.errors.length, 2); // Maria sbg Ketua penuh; Daniel sbg Penatua penuh (2 dari 2)
  assert.ok(ag.errors.every((e) => /sudah penuh/.test(e.message)));
});

test("kelompok baru otomatis punya Admin Tim; anggota di file yang sama boleh langsung memakainya", () => {
  const { st, ctx, gs, sheet } = setup();
  stageGroups(ctx, st, gs, {
    KelompokRapat: [KG(4, "Panitia")],
    JabatanKelompok: [],
    AnggotaKelompok: [AG(4, "Panitia", "Setia Budi", "Admin Tim"), AG(5, "Panitia", "Maria Susanti")],
  });
  assert.equal(sheet("AnggotaKelompok").created, 2);
  assert.equal(sheet("AnggotaKelompok").errors.length, 0);
  const g = gs.groups.get("panitia")!;
  const admin = g.positions.get("admin tim")!;
  assert.deepEqual(admin.caps, { schedule: true, write: true, finalize: true, manage: true });
  assert.equal(admin.seats, null);
  assert.deepEqual(g.members.get("p1")!.positionIds, [admin.id]);
});

test("Admin Tim yang juga ditulis di JabatanKelompok tidak dobel; jumlah orang dari sheet dipakai, haknya tetap penuh", () => {
  const { st, ctx, gs, sheet } = setup();
  stageGroups(ctx, st, gs, {
    KelompokRapat: [KG(4, "Panitia")],
    JabatanKelompok: [JB(4, "Panitia", "Admin Tim", "", "", "", "", "2")],
    AnggotaKelompok: [AG(4, "Panitia", "Setia Budi", "Admin Tim"), AG(5, "Panitia", "Maria Susanti", "Admin Tim"), AG(6, "Panitia", "Daniel", "Admin Tim")],
  });
  const g = gs.groups.get("panitia")!;
  assert.equal([...g.positions.values()].filter((p) => p.name === "Admin Tim").length, 1);
  assert.equal(g.positions.get("admin tim")!.seats, 2);
  assert.equal(sheet("JabatanKelompok").created, 1);
  assert.equal(sheet("AnggotaKelompok").created, 2); // orang ketiga ditolak: jabatan penuh
  assert.equal(sheet("AnggotaKelompok").errors.length, 1);
});
