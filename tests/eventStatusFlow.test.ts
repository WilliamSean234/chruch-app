import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTransition, canTransition, isEditable } from "../src/lib/eventStatusFlow";

test("acara batal bisa diaktifkan kembali ke draf, tetapi tidak langsung terbit", () => {
  assert.equal(canTransition("CANCELLED", "DRAFT"), true);
  assert.equal(canTransition("CANCELLED", "PUBLISHED"), false);
  assert.doesNotThrow(() => assertTransition("CANCELLED", "DRAFT"));
  assert.throws(() => assertTransition("CANCELLED", "PUBLISHED"));
});

test("alur biasa tetap: draf ↔ terbit, keduanya bisa dibatalkan", () => {
  assert.equal(canTransition("DRAFT", "PUBLISHED"), true);
  assert.equal(canTransition("PUBLISHED", "DRAFT"), true);
  assert.equal(canTransition("DRAFT", "CANCELLED"), true);
  assert.equal(canTransition("PUBLISHED", "CANCELLED"), true);
  assert.equal(isEditable("CANCELLED"), false);
});
