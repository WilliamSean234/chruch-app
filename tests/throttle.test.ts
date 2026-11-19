import { test } from "node:test";
import assert from "node:assert/strict";
import { afterFailure, clientIp, keysFor, lockedMs, minutesLeft, POLICIES, type Row } from "../src/lib/throttle";

const T0 = new Date("2026-11-19T00:00:00Z");
const at = (min: number) => new Date(T0.getTime() + min * 60_000);

/** n percobaan salah berturut-turut pada menit 0. */
function fail(n: number, p: (typeof POLICIES)[keyof typeof POLICIES] = POLICIES.ipemail): Row | null {
  let row: Row | null = null;
  for (let i = 0; i < n; i++) row = afterFailure(row, p, T0);
  return row;
}

test("terkunci pada percobaan salah ke-5, bukan sebelumnya", () => {
  assert.equal(lockedMs(fail(4), T0), 0);
  const row = fail(5)!;
  assert.equal(row.failures, 5);
  assert.equal(minutesLeft(lockedMs(row, T0)), 15);
});

test("kunci lepas setelah 15 menit", () => {
  const row = fail(5)!;
  assert.ok(lockedMs(row, at(14)) > 0);
  assert.equal(lockedMs(row, at(15)), 0);
});

test("jendela habis: hitungan mulai dari awal", () => {
  const row = fail(3)!;
  const later = afterFailure(row, POLICIES.ipemail, at(40));
  assert.equal(later.failures, 1);
  assert.equal(later.lockedUntil, null);
});

test("kunci email dan alamat lebih longgar daripada pasangan alamat+email", () => {
  assert.equal(lockedMs(fail(19, POLICIES.email), T0), 0);
  assert.ok(lockedMs(fail(20, POLICIES.email), T0) > 0);
  assert.equal(lockedMs(fail(29, POLICIES.ip), T0), 0);
  assert.ok(lockedMs(fail(30, POLICIES.ip), T0) > 0);
});

test("kunci disusun dari email yang dirapikan huruf besar-kecil dan spasinya", () => {
  const a = keysFor("  Admin@Gereja.ID ", "1.2.3.4").map((k) => k.key);
  const b = keysFor("admin@gereja.id", "1.2.3.4").map((k) => k.key);
  assert.deepEqual(a, b);
  assert.deepEqual(keysFor("a@b.c", "9.9.9.9").map((k) => k.scope), ["ipemail", "email", "ip"]);
});

test("alamat klien: x-forwarded-for pertama, lalu x-real-ip, lalu unknown", () => {
  const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
  assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientIp(h({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(clientIp(h({})), "unknown");
});
