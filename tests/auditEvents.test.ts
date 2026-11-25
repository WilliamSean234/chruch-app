import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEventOptions, eventIdsOf, isOwnEdit, type EventIn } from "../src/lib/auditEvents";

const ev = (id: string, title: string, iso: string): EventIn => ({ id, title, startsAt: new Date(iso), templateName: title });
const fmt = { part: (e: EventIn) => `${e.title} ${e.startsAt.toISOString().slice(11, 16)}`, label: (e: EventIn) => `${e.title} · ${e.startsAt.toISOString().slice(0, 16)}`, day: (e: EventIn) => e.startsAt.toISOString().slice(0, 10), dayKey: (e: EventIn) => e.startsAt.toISOString().slice(0, 10) };

const I = ev("a", "Ibadah Minggu I", "2026-11-29T00:00:00Z");
const II = ev("b", "Ibadah Minggu II", "2026-11-29T02:30:00Z");
const I2 = ev("c", "Ibadah Minggu I", "2026-12-06T00:00:00Z");
const FELLOW = { id: "d", title: "Fellowship", startsAt: new Date("2026-11-28T11:00:00Z"), templateName: "Fellowship" };

test("Ibadah Minggu I dan II di hari yang sama jadi satu pilihan", () => {
  const o = buildEventOptions([I2, II, I, FELLOW], new Set(), fmt);
  assert.deepEqual(o.map((x) => x.label), ["Ibadah Minggu I · 2026-12-06T00:00", "Ibadah Minggu · 2026-11-29", "Fellowship · 2026-11-28T11:00"]);
  assert.equal(o[1]!.value, "a,b");
});

test("tetap digabung walau salah satunya diubah sendiri; keduanya dipisah di dalam pilihan dan yang diubah sendiri ditandai", () => {
  const o = buildEventOptions([II, I], new Set(["b"]), fmt);
  assert.equal(o.length, 1);
  assert.equal(o[0]!.value, "a,b");
  assert.deepEqual(o[0]!.parts!.map((p) => [p.value, p.solo]), [["a", false], ["b", true]]);
});

test("ibadah yang pasangannya tidak punya catatan tetap tampil sendiri", () => {
  const o = buildEventOptions([I], new Set(), fmt);
  assert.deepEqual(o.map((x) => x.value), ["a"]);
  assert.equal(o[0]!.parts, undefined);
});

test("edit sendiri: pengaturan petugas yang ikut pasangan tidak dihitung", () => {
  assert.equal(isOwnEdit("assignment.set", { mirror: true }), false);
  assert.equal(isOwnEdit("assignment.set", { mirroredFrom: "x" }), false);
  assert.equal(isOwnEdit("assignment.set", { mirror: false }), true);
  assert.equal(isOwnEdit("event.update", {}), true);
  assert.equal(isOwnEdit("event.publish", {}), false);
});

test("nilai pilihan gabungan dipecah jadi id", () => {
  assert.deepEqual(eventIdsOf("a,b"), ["a", "b"]);
  assert.deepEqual(eventIdsOf("a"), ["a"]);
});
