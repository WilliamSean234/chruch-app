import test from "node:test";
import assert from "node:assert/strict";
import { isFresh, PRESENCE_BEAT_MS, PRESENCE_TTL_MS, presenceCutoff, validClientId } from "../src/lib/presenceRules";

const now = new Date("2026-11-26T08:00:00.000Z");

test("online selama tanda terakhir belum lewat batas, offline sesudahnya", () => {
  assert.equal(isFresh(new Date(now.getTime() - 1_000), now), true);
  assert.equal(isFresh(new Date(now.getTime() - (PRESENCE_TTL_MS - 1)), now), true);
  assert.equal(isFresh(new Date(now.getTime() - PRESENCE_TTL_MS), now), false);
  assert.equal(isFresh(new Date(now.getTime() - 5 * 60_000), now), false);
});

test("satu tanda yang terlewat belum membuat offline, dua tanda terlewat sudah", () => {
  assert.ok(PRESENCE_TTL_MS > PRESENCE_BEAT_MS * 2, "jeda 40 detik harus lebih dari dua kali jeda tanda");
  assert.equal(isFresh(new Date(now.getTime() - PRESENCE_BEAT_MS * 2), now), true); // satu tanda hilang di jaringan
  assert.equal(presenceCutoff(now).getTime(), now.getTime() - PRESENCE_TTL_MS);
});

test("clientId hanya huruf, angka, garis; 8 sampai 64 karakter", () => {
  assert.equal(validClientId("3f2c9a1e-7b44-4d0a-9c1e-aa11bb22cc33"), true);
  assert.equal(validClientId("t1abc2def"), true);
  assert.equal(validClientId("pendek"), false);
  assert.equal(validClientId("a".repeat(65)), false);
  assert.equal(validClientId("ada spasi di sini"), false);
  assert.equal(validClientId("'; drop table--"), false);
  assert.equal(validClientId(42), false);
  assert.equal(validClientId(undefined), false);
});
