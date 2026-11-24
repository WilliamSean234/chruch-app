import { test } from "node:test";
import assert from "node:assert/strict";
import { daysAgo, RETENTION_DAYS } from "../src/lib/retention";

test("daysAgo mundur sejumlah hari penuh", () => {
  const now = new Date("2026-11-24T10:00:00Z");
  assert.equal(daysAgo(now, 7).toISOString(), "2026-11-17T10:00:00.000Z");
  assert.equal(daysAgo(now, 30).toISOString(), "2026-10-25T10:00:00.000Z");
});

test("masa simpan data sementara masuk akal", () => {
  assert.ok(RETENTION_DAYS.idempotencyKey >= 1);
  assert.ok(RETENTION_DAYS.registrationRejected >= RETENTION_DAYS.registrationUnverified);
  for (const d of Object.values(RETENTION_DAYS)) assert.ok(Number.isInteger(d) && d > 0);
});
