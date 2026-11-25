import { test } from "node:test";
import assert from "node:assert/strict";
import { describe, wantedOf, type Refs } from "../src/lib/auditDescribe";
import { diffEvent } from "../src/lib/eventDiff";

const at = (iso: string) => new Date(iso);
const refs: Refs = {
  persons: new Map([["p1", "Ruth Natalia"], ["p2", "Michael Tanoto"]]),
  events: new Map([
    ["e1", { kind: "IBADAH", title: "Ibadah Minggu I", number: "IB-1", startsAt: at("2026-11-29T00:00:00Z"), group: null }],
    ["e2", { kind: "RAPAT", title: "enc:v1:xxxx", number: "RP-1", startsAt: at("2026-12-02T12:00:00Z"), group: "Pengurus Pemuda" }],
  ]),
  assignments: new Map([["a1", { ministry: "Gitar", slotNo: 2, eventId: "e1" }]]),
  rehearsals: new Map(),
  names: { teams: new Map([["t1", "Tim EBM"]]), ministries: new Map([["m1", "Sound"], ["m2", "LCD"]]), positions: new Map([["g1", "Ketua"]]), groups: new Map([["gr1", "Pengurus Pemuda"]]), templates: new Map(), rooms: new Map([["r1", "Ruang B"]]), cg: new Map() },
  users: new Map([["u1", "Ruth Natalia"]]),
  regs: new Map(),
  series: new Map(),
};
const row = (action: string, entity: string, entityId: string, payload?: unknown, reason: string | null = null) => ({ action, entity, entityId, reason, payload });

test("mengisi petugas: nama orang, posisi, dan acara; tanpa ID", () => {
  const d = describe(row("assignment.set", "EventAssignment", "a1", { eventId: "e1", personId: "p2", previousPersonId: "p1", mirror: false }), refs);
  assert.match(d.target!, /^Gitar 2 · Ibadah Minggu I · /);
  assert.equal(d.how, "Ruth Natalia → Michael Tanoto");
  assert.equal(describe(row("assignment.set", "EventAssignment", "a1", { personId: null, previousPersonId: "p1" }), refs).how, "Dikosongkan (sebelumnya Ruth Natalia)");
});

test("rapat disebut dengan kelompok dan tanggal; judul terenkripsi tidak pernah tampil", () => {
  const d = describe(row("meeting.update", "Event", "e2", { date: "2026-12-03", roomId: "r1", titleChanged: true }), refs);
  assert.match(d.target!, /^Rapat Pengurus Pemuda · /);
  assert.ok(!d.target!.includes("enc:"));
  assert.equal(d.how, "Mengubah judul, tanggal, ruangan · ruangan Ruang B");
  assert.equal(describe(row("meeting.participant.attend", "Event", "e2", { from: "INVITED", to: "PRESENT" }), refs).how, "diundang → hadir");
});

test("tambah dan cabut pelayanan memakai nama posisi", () => {
  const d = describe(row("person.ministries", "Person", "p1", { add: ["m1"], remove: ["m2"] }), refs);
  assert.equal(d.target, "Ruth Natalia");
  assert.equal(d.how, "Menambah: Sound · Mencabut: LCD");
});

test("perubahan acara menampilkan dari → ke; catatan lama menampilkan nama isian", () => {
  const before = { title: "A", startsAt: "2026-11-29T00:00:00Z", endsAt: "2026-11-29T02:00:00Z", room: { name: "Ruang A" }, attendanceMode: "COUNT", theme: null, padus: null };
  const after = { ...before, title: "B", room: { name: "Ruang B" }, theme: "Syukur" };
  const ch = diffEvent(before, after);
  assert.deepEqual(ch.map((c) => c.label), ["Judul", "Ruangan", "Tema"]);
  assert.equal(describe(row("event.update", "Event", "e1", { changes: ch }), refs).how, "Judul: A → B · Ruangan: Ruang A → Ruang B · Tema: kosong → Syukur");
  assert.equal(describe(row("event.update", "Event", "e1", { title: "x", roomId: "r1" }), refs).how, "Mengubah judul, ruangan");
  assert.deepEqual(diffEvent(before, before), []);
});

test("akun, kelompok, dan impor ditulis sebagai kalimat", () => {
  assert.equal(describe(row("user.create", "User", "u1", { personId: "p1", roles: ["ADMIN_TIM"], ebmScheduler: false }), refs).how, "Role: Admin Tim");
  assert.equal(describe(row("group.member.add", "MeetingGroup", "gr1", { personId: "p1", name: "Ruth", positionIds: ["g1"] }), refs).how, "Ruth · jabatan Ketua");
  assert.equal(describe(row("import.apply", "Import", "x", { Orang: { dibuat: 5, dilewati: 1, error: 0 } }), refs).how, "Orang: 5 dibuat, 1 dilewati");
});

test("id yang perlu diterjemahkan dikumpulkan dari objek dan isi", () => {
  const w = wantedOf([row("assignment.set", "EventAssignment", "a1", { eventId: "e1", personId: "p2", previousPersonId: "p1" }), row("person.ministries", "Person", "p1", { add: ["m1"], remove: [] })]);
  assert.deepEqual([...w.assignments], ["a1"]);
  assert.deepEqual([...w.persons].sort(), ["p1", "p2"]);
  assert.deepEqual([...w.ministries], ["m1"]);
});
