import { test } from "node:test";
import assert from "node:assert/strict";
import { addDaysYmd, attendanceStage, diffDaysYmd, digestSummary, limitedList, monthBounds, shortHash } from "../src/lib/notifyText";

test("addDaysYmd dan diffDaysYmd melewati akhir bulan dan tahun", () => {
  assert.equal(addDaysYmd("2026-11-30", 1), "2026-12-01");
  assert.equal(addDaysYmd("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysYmd("2026-03-01", -1), "2026-02-28");
  assert.equal(diffDaysYmd("2026-11-26", "2026-11-23"), 3);
});

test("limitedList meringkas sisanya", () => {
  assert.equal(limitedList(["a", "b"], 3), "a; b");
  assert.equal(limitedList(["a", "b", "c", "d", "e"], 3), "a; b; c; +2 lainnya");
});

test("shortHash stabil dan berbeda untuk teks berbeda", () => {
  assert.equal(shortHash("abc"), shortHash("abc"));
  assert.notEqual(shortHash("abc"), shortHash("abd"));
});

test("monthBounds", () => {
  assert.deepEqual(monthBounds("2026-12-15"), { month: "2026-12", from: "2026-12-01", next: "2027-01-01", year: 2026, monthIndex: 11 });
});

test("digestSummary menghilangkan bagian nol", () => {
  assert.equal(digestSummary({ acara: 3, latihan: 0, rapat: 1 }), "3 pelayanan, 1 rapat.");
  assert.equal(digestSummary({ acara: 0, latihan: 0, rapat: 0 }), "");
});

test("attendanceStage: sekali di awal, sekali lagi setelah 3 hari", () => {
  assert.equal(attendanceStage(0, { first: false, second: false }), 1);
  assert.equal(attendanceStage(1, { first: true, second: false }), null);
  assert.equal(attendanceStage(2, { first: true, second: false }), null);
  assert.equal(attendanceStage(3, { first: true, second: false }), 2);
  assert.equal(attendanceStage(3, { first: false, second: false }), 2);
  assert.equal(attendanceStage(5, { first: true, second: true }), null);
});
