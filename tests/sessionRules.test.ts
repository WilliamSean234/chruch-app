import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionRevoked } from "../src/lib/sessionRules";

test("tanpa waktu cabut, sesi apa pun masih berlaku (termasuk sesi lama tanpa cap waktu)", () => {
  assert.equal(sessionRevoked(undefined, null), false);
  assert.equal(sessionRevoked(1_000, null), false);
});

test("sesi yang dibuat sebelum kata sandi diganti dicabut", () => {
  const changed = new Date(5_000);
  assert.equal(sessionRevoked(4_999, changed), true);
});

test("sesi yang dibuat setelah (atau tepat saat) kata sandi diganti tetap berlaku", () => {
  const changed = new Date(5_000);
  assert.equal(sessionRevoked(5_000, changed), false);
  assert.equal(sessionRevoked(9_000, changed), false);
});

test("sesi lama tanpa cap waktu dicabut begitu waktu cabut terisi", () => {
  assert.equal(sessionRevoked(undefined, new Date(5_000)), true);
});
