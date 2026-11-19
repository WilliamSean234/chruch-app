import { test } from "node:test";
import assert from "node:assert/strict";
import { addMinutes, eachDate, localParts, matchesPattern, zonedToUtc } from "../src/lib/time";

test("jam gereja (WIB, UTC+7) diubah ke UTC dan sebaliknya", () => {
  const d = zonedToUtc("2026-11-29", "09:30", "Asia/Jakarta");
  assert.equal(d.toISOString(), "2026-11-29T02:30:00.000Z");
  assert.deepEqual(localParts(d, "Asia/Jakarta"), { date: "2026-11-29", time: "09:30" });
});

test("jam sebelum pukul 07.00 tetap jatuh di tanggal lokal yang benar", () => {
  const d = zonedToUtc("2026-12-01", "05:00", "Asia/Jakarta");
  assert.equal(d.toISOString(), "2026-11-30T22:00:00.000Z");
  assert.equal(localParts(d, "Asia/Jakarta").date, "2026-12-01");
});

test("addMinutes", () => {
  assert.equal(addMinutes(new Date("2026-11-29T02:30:00Z"), 90).toISOString(), "2026-11-29T04:00:00.000Z");
});

test("eachDate memuat kedua ujung", () => {
  const days = [...eachDate("2026-11-28", "2026-12-02")].map((d) => d.iso);
  assert.deepEqual(days, ["2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
});

test("pola template: tiap minggu, Sabtu ke-4, dan yang terakhir", () => {
  const sun29 = { weekday: 0, dom: 29, dim: 30 };
  const sun22 = { weekday: 0, dom: 22, dim: 30 };
  assert.equal(matchesPattern({ weekday: 0, recurrence: "WEEKLY", ordinal: null }, sun29), true);
  assert.equal(matchesPattern({ weekday: 6, recurrence: "WEEKLY", ordinal: null }, sun29), false);
  assert.equal(matchesPattern({ weekday: 0, recurrence: "MONTHLY_NTH", ordinal: 4 }, sun22), true);
  assert.equal(matchesPattern({ weekday: 0, recurrence: "MONTHLY_NTH", ordinal: 4 }, sun29), false);
  assert.equal(matchesPattern({ weekday: 0, recurrence: "MONTHLY_NTH", ordinal: 5 }, sun29), true);
  assert.equal(matchesPattern({ weekday: 0, recurrence: "MONTHLY_NTH", ordinal: 5 }, sun22), false);
});
