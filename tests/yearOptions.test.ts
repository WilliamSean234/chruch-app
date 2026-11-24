import { test } from "node:test";
import assert from "node:assert/strict";
import { yearOptions } from "../src/lib/yearOptions";

test("yearOptions: hanya tahun yang ada datanya, terbaru dulu", () => {
  assert.deepEqual(yearOptions([2025, 2026], 2026), [2026, 2025]);
  assert.deepEqual(yearOptions([2024, 2026], 2026), [2026, 2024]); // 2025 tidak muncul
});

test("yearOptions: tahun terpilih selalu ada, belum dimuat = hanya tahun terpilih", () => {
  assert.deepEqual(yearOptions([2025], 2026), [2026, 2025]);
  assert.deepEqual(yearOptions(undefined, 2026), [2026]);
  assert.deepEqual(yearOptions([], 2026), [2026]);
  assert.deepEqual(yearOptions([2026, 2026], 2026), [2026]);
});
