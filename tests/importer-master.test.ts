import { test } from "node:test";
import assert from "node:assert/strict";
import { Report, type Ctx, type Row } from "../src/lib/importer/common";
import { stageOrang, stagePelayanan, stageRuangan, type MasterState } from "../src/lib/importer/master";

const row = (n: number, v: Record<string, string>): Row => ({ n, v });

function setup() {
  const named = (id: string, name: string) => [name.toLowerCase(), { id, name, isNew: false }] as const;
  const st = {
    M: {
      positions: new Map([named("pos1", "Jemaat")]),
      cgs: new Map(), communities: new Map(),
      teams: new Map([named("t1", "Tim pemusik")]),
      rooms: new Map(), ministries: new Map(), persons: new Map(), templates: new Map(),
    },
    W: {
      rooms: [], roomRevive: [], ministries: [], ministryRevive: [], personMinistries: [], personCommunities: [],
    },
    credentials: [],
  } as unknown as MasterState;
  const rep = new Report();
  const ctx: Ctx = { u: { userId: "u", tenantId: "t", personId: null, roles: [], permissions: [] }, apply: false, rep };
  return { st, ctx, rep };
}

test("ruangan: lantai boleh kosong, harus angka bulat -5 sampai 99", () => {
  const { st, ctx, rep } = setup();
  stageRuangan(ctx, st, [
    row(4, { name: "401A", floor: "4", active: "" }),
    row(5, { name: "Aula", floor: "", active: "" }),
    row(6, { name: "Basement", floor: "-1", active: "" }),
    row(7, { name: "Atap", floor: "100", active: "" }),
    row(8, { name: "Lobi", floor: "dua", active: "" }),
  ]);
  const rooms = (st.W as unknown as { rooms: { name: string; floor: number | null }[] }).rooms;
  assert.deepEqual(rooms.map((r) => [r.name, r.floor]), [["401A", 4], ["Aula", null], ["Basement", -1]]);
  assert.equal(rep.get("Ruangan").errors.length, 2);
  assert.match(rep.get("Ruangan").errors[0].message, /Lantai/);
});

test("pelayanan: Khusus band Ya/Tidak, kosong = Tidak", () => {
  const { st, ctx, rep } = setup();
  stagePelayanan(ctx, st, [
    row(4, { team: "Tim pemusik", name: "Drum", rehearsal: "Ya", bandOnly: "Ya" }),
    row(5, { team: "Tim pemusik", name: "Singer", rehearsal: "Ya", bandOnly: "" }),
    row(6, { team: "Tim pemusik", name: "Piano", rehearsal: "Ya", bandOnly: "mungkin" }),
  ]);
  const list = (st.W as unknown as { ministries: { name: string; bandOnly: boolean }[] }).ministries;
  assert.deepEqual(list.map((m) => [m.name, m.bandOnly]), [["Drum", true], ["Singer", false]]);
  assert.equal(rep.get("Pelayanan").errors.length, 1);
});

test("orang: nama panggilan disimpan, maksimal 40 huruf", () => {
  const { st, ctx, rep } = setup();
  const base = { title: "", gender: "L", position: "Jemaat", cg: "", community: "", birth: "", origin: "", originChurch: "", ministries: "" };
  stageOrang(ctx, st, [
    row(4, { ...base, name: "Yosua Santoso", nickname: "Ko  Yosi" }),
    row(5, { ...base, name: "Maria Susanti", nickname: "" }),
    row(6, { ...base, name: "Daniel Tan", nickname: "x".repeat(41) }),
  ]);
  const byName = new Map([...st.M.persons.values()].map((p) => [p.name, p.data?.nickname]));
  assert.equal(byName.get("Yosua Santoso"), "Ko Yosi");
  assert.equal(byName.get("Maria Susanti"), null);
  assert.equal(byName.has("Daniel Tan"), false);
  assert.match(rep.get("Orang").errors[0].message, /Nama panggilan/);
});

test("orang yang sudah ada: pelayanan baru tetap ditambahkan, yang sudah dimiliki dilewati", () => {
  const { st, ctx, rep } = setup();
  const M = st.M as unknown as { persons: Map<string, unknown>; ministries: Map<string, unknown[]> };
  M.ministries.set("drum", [{ id: "m-drum", name: "Drum", isNew: false, teamId: "t1", rehearsal: true, deleted: false }]);
  M.ministries.set("singer", [{ id: "m-singer", name: "Singer", isNew: false, teamId: "t1", rehearsal: true, deleted: false }]);
  M.persons.set("budi", { id: "p1", name: "Budi", key: "budi", isNew: false, cgId: null, hasUser: false, ministryIds: new Set(["m-drum"]) });
  const base = { title: "", gender: "L", position: "Jemaat", cg: "", community: "", birth: "", origin: "", originChurch: "", nickname: "" };
  stageOrang(ctx, st, [
    row(4, { ...base, name: "Budi", ministries: "Drum, Singer" }), // Drum sudah ada, Singer baru
    row(5, { ...base, name: "Budi", ministries: "Drum" }), // tidak ada yang baru
  ]);
  const added = (st.W as unknown as { personMinistries: { personId: string; ministryId: string }[] }).personMinistries;
  assert.deepEqual(added, [{ personId: "p1", ministryId: "m-singer" }]);
  assert.equal(rep.get("Orang").created, 1);
  assert.equal(rep.get("Orang").skipped, 1);
});

test("baris hanya-pelayanan (dari kuesioner): orang harus sudah ada, jangan membuat orang baru", () => {
  const { st, ctx, rep } = setup();
  const M = st.M as unknown as { persons: Map<string, unknown>; ministries: Map<string, unknown[]> };
  M.ministries.set("drum", [{ id: "m-drum", name: "Drum", isNew: false, teamId: "t1", rehearsal: true, deleted: false }]);
  M.persons.set("budi", { id: "p1", name: "Budi", key: "budi", isNew: false, cgId: null, hasUser: false, ministryIds: new Set() });
  const only = { title: "", nickname: "", birth: "", gender: "", position: "", cg: "", community: "", origin: "", originChurch: "", addOnly: "1" };
  stageOrang(ctx, st, [row(4, { ...only, name: "Budi", ministries: "Drum" }), row(5, { ...only, name: "Orang Asing", ministries: "Drum" })]);
  const w = st.W as unknown as { personMinistries: unknown[] };
  assert.equal(w.personMinistries.length, 1);
  assert.equal(rep.get("Orang").created, 1);
  assert.equal(rep.get("Orang").errors.length, 1);
  assert.match(rep.get("Orang").errors[0].message, /belum ada di data Orang/);
});
