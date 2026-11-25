import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEventOptions, eventIdsOf, isOwnEdit, type EventIn } from "../src/lib/auditEvents";

const ev = (id: string, title: string, iso: string): EventIn => ({ id, title, startsAt: new Date(iso), templateName: title });
const fmt = { label: (e: EventIn) => `${e.title} · ${e.startsAt.toISOString().slice(0, 16)}`, day: (e: EventIn) => e.startsAt.toISOString().slice(0, 10), dayKey: (e: EventIn) => e.startsAt.toISOString().slice(0, 10) };

const I = ev("a", "Ibadah Minggu I", "2026-11-29T00:00:00Z");
const II = ev("b", "Ibadah Minggu II", "2026-11-29T02:30:00Z");
const I2 = ev("c", "Ibadah Minggu I", "2026-12-06T00:00:00Z");
const FELLOW = { id: "d", title: "Fellowship", startsAt: new Date("2026-11-28T11:00:00Z"), templateName: "Fellowship" };

test("Ibadah Minggu I dan II di hari yang sama jadi satu pilihan", () => {
  const o = buildEventOptions([I2, II, I, FELLOW], new Set(), fmt);
  assert.deepEqual(o.map((x) => x.label), ["Ibadah Minggu I · 2026-12-06T00:00", "Ibadah Minggu · 2026-11-29", "Fellowship · 2026-11-28T11:00"]);
  assert.equal(o[1]!.value, "a,b");
});

test("bila salah satunya pernah diubah sendiri, keduanya tampil terpisah", () => {
  const o = buildEventOptions([II, I], new Set(["b"]), fmt);
  assert.deepEqual(o.map((x) => x.value), ["b", "a"]);
});

test("ibadah yang pasangannya tidak punya catatan tetap tampil sendiri", () => {
  assert.deepEqual(buildEventOptions([I], new Set(), fmt).map((x) => x.value), ["a"]);
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
