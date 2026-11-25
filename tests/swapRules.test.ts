import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLine, showRejected, swapBlock, swapStale } from "../src/lib/swapRules";

const now = new Date("2026-12-01T03:00:00Z");
const future = new Date("2026-12-06T04:00:00Z");
const ok = { eventStatus: "PUBLISHED", eventKind: "IBADAH", endsAt: future, seatPersonId: "a", requesterPersonId: "a" };

test("permintaan boleh dibuat untuk kursi sendiri di ibadah terbit yang belum selesai", () => {
  assert.equal(swapBlock(ok, now), null);
});

test("ditolak bila bukan kursinya, belum terbit, dibatalkan, selesai, atau bukan ibadah", () => {
  assert.match(swapBlock({ ...ok, seatPersonId: "b" }, now)!, /bukan milik/);
  assert.match(swapBlock({ ...ok, seatPersonId: null }, now)!, /bukan milik/);
  assert.match(swapBlock({ ...ok, requesterPersonId: null }, now)!, /bukan milik/);
  assert.match(swapBlock({ ...ok, eventStatus: "DRAFT" }, now)!, /belum diterbitkan/);
  assert.match(swapBlock({ ...ok, eventStatus: "CANCELLED" }, now)!, /dibatalkan/);
  assert.match(swapBlock({ ...ok, endsAt: new Date("2026-11-30T04:00:00Z") }, now)!, /selesai/);
  assert.match(swapBlock({ ...ok, eventKind: "RAPAT" }, now)!, /ibadah/);
});

test("permintaan terbuka kedaluwarsa bila kursi berganti orang, acara batal, dihapus, atau selesai", () => {
  const r = { requesterPersonId: "a" };
  const ev = { status: "PUBLISHED", endsAt: future, deleted: false };
  assert.equal(swapStale(r, { personId: "a" }, ev, now), false);
  assert.equal(swapStale(r, { personId: "b" }, ev, now), true);
  assert.equal(swapStale(r, { personId: null }, ev, now), true);
  assert.equal(swapStale(r, { personId: "a" }, { ...ev, status: "CANCELLED" }, now), true);
  assert.equal(swapStale(r, { personId: "a" }, { ...ev, status: "DRAFT" }, now), true);
  assert.equal(swapStale(r, { personId: "a" }, { ...ev, deleted: true }, now), true);
  assert.equal(swapStale(r, { personId: "a" }, { ...ev, endsAt: new Date("2026-11-30T04:00:00Z") }, now), true);
  assert.equal(swapStale(r, null, ev, now), true);
  assert.equal(swapStale(r, { personId: "a" }, null, now), true);
});

test("teks dibersihkan dan dipotong", () => {
  assert.equal(cleanLine("  Budi   Santoso \n", 80), "Budi Santoso");
  assert.equal(cleanLine("   ", 80), null);
  assert.equal(cleanLine(null, 80), null);
  assert.equal(cleanLine("abcdef", 3), "abc");
  assert.equal(cleanLine("a\u0000b\u0007c", 80), "a b c");
});

test("catatan ditolak terlihat 7 hari", () => {
  assert.equal(showRejected(new Date("2026-11-27T03:00:00Z"), now), true);
  assert.equal(showRejected(new Date("2026-11-20T03:00:00Z"), now), false);
  assert.equal(showRejected(null, now), false);
});
