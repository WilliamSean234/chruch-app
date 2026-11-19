import { test } from "node:test";
import assert from "node:assert/strict";
import { describeFirst, expandDates, MAX_OCCURRENCES, patternText } from "../src/lib/recurrence";

test("mingguan: tanggal pertama ikut, berhenti setelah jumlah yang diminta", () => {
  assert.deepEqual(expandDates("2026-11-22", "WEEKLY", { count: 4 }).dates, ["2026-11-22", "2026-11-29", "2026-12-06", "2026-12-13"]);
});

test("tiap 2 minggu", () => {
  assert.deepEqual(expandDates("2026-11-22", "BIWEEKLY", { count: 3 }).dates, ["2026-11-22", "2026-12-06", "2026-12-20"]);
});

test("hari ke-n tiap bulan: Minggu ke-4 (melewati pergantian tahun)", () => {
  assert.deepEqual(expandDates("2026-11-22", "MONTHLY_NTH", { count: 3 }).dates, ["2026-11-22", "2026-12-27", "2027-01-24"]);
});

test("minggu ke-5 dibaca sebagai 'yang terakhir' di bulan itu", () => {
  assert.deepEqual(describeFirst("2026-11-29"), { weekday: 0, ordinal: 5 });
  assert.deepEqual(expandDates("2026-11-29", "MONTHLY_NTH", { count: 2 }).dates, ["2026-11-29", "2026-12-27"]);
});

test("batas tanggal: yang melewati batas tidak ikut", () => {
  const r = expandDates("2026-11-22", "WEEKLY", { until: "2026-12-06" });
  assert.deepEqual(r.dates, ["2026-11-22", "2026-11-29", "2026-12-06"]);
  assert.equal(r.capped, false);
});

test("paling banyak MAX_OCCURRENCES; batas tanggal yang terlalu jauh ditandai terpotong", () => {
  const byCount = expandDates("2026-11-22", "WEEKLY", { count: 500 });
  assert.equal(byCount.dates.length, MAX_OCCURRENCES);
  const byUntil = expandDates("2026-11-22", "WEEKLY", { until: "2030-01-01" });
  assert.equal(byUntil.dates.length, MAX_OCCURRENCES);
  assert.equal(byUntil.capped, true);
});

test("teks penjelasan pola", () => {
  assert.equal(patternText("WEEKLY", 0, null), "Tiap minggu, hari Minggu");
  assert.equal(patternText("BIWEEKLY", 6, null), "Tiap 2 minggu, hari Sabtu");
  assert.equal(patternText("MONTHLY_NTH", 6, 4), "Sabtu ke-4 tiap bulan");
  assert.equal(patternText("MONTHLY_NTH", 0, 5), "Minggu terakhir tiap bulan");
});
