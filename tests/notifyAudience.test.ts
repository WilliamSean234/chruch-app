import { test } from "node:test";
import assert from "node:assert/strict";
import { isStaffAudience, seatInAudience } from "../src/lib/notifyAudience";

test("Semua mencakup PIC dan Pembicara", () => {
  assert.equal(seatInAudience("ALL", "Penatalayan ibadah", "PIC"), true);
  assert.equal(seatInAudience("ALL", "Penatalayan ibadah", "Pembicara"), true);
});

test("Praise & Worship: pemusik, singer, liturgos; bukan PIC atau Pembicara", () => {
  assert.equal(seatInAudience("PW", "Penatalayan ibadah", "Singer"), true);
  assert.equal(seatInAudience("PW", "Penatalayan ibadah", "Gitar"), true);
  assert.equal(seatInAudience("PW", "Penatalayan ibadah", "Liturgos"), true);
  assert.equal(seatInAudience("PW", "Tim pemusik", "Drum"), true);
  assert.equal(seatInAudience("PW", "Penatalayan ibadah", "PIC"), false);
  assert.equal(seatInAudience("PW", "Penatalayan ibadah", "Pembicara"), false);
  assert.equal(seatInAudience("PW", "Tim EBM", "Operator"), false);
});

test("EBM dan Usher sesuai tim kursinya", () => {
  assert.equal(seatInAudience("EBM", "Tim EBM", "Operator"), true);
  assert.equal(seatInAudience("EBM", "Usher", "Usher 1"), false);
  assert.equal(seatInAudience("USHER", "Usher", "Usher 1"), true);
  assert.equal(seatInAudience("USHER", "Tim EBM", "Operator"), false);
});

test("isStaffAudience hanya menerima pilihan yang dikenal", () => {
  assert.equal(isStaffAudience("PW"), true);
  assert.equal(isStaffAudience("SEMUA"), false);
});
