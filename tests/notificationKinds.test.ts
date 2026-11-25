import { test } from "node:test";
import assert from "node:assert/strict";
import { isNotifKind, kindsFor, NOTIF_KINDS } from "../src/lib/notificationKinds";

test("setiap jenis notifikasi punya kunci unik", () => {
  assert.equal(new Set(NOTIF_KINDS.map((k) => k.kind)).size, NOTIF_KINDS.length);
});

test("jenis yang ditampilkan mengikuti peran akun", () => {
  assert.deepEqual(kindsFor(["PELAYAN"]).map((k) => k.audience), ["PELAYAN", "PELAYAN", "PELAYAN", "PELAYAN", "PELAYAN"]);
  assert.ok(kindsFor(["SEMUA", "PELAYAN", "PENJADWAL", "PENGELOLA", "KELOMPOK"]).length === NOTIF_KINDS.length);
  assert.deepEqual(kindsFor(["SEMUA"]).map((k) => k.kind), ["ULANG_TAHUN", "ONLINE_H1"]);
  assert.deepEqual(kindsFor(["PENGELOLA"]).map((k) => k.kind), ["TUKAR_MASUK"]); // Penjadwal dan Admin Tim
  assert.ok(kindsFor(["PELAYAN"]).some((k) => k.kind === "TUKAR_DITOLAK"));
  assert.equal(kindsFor([]).length, 0);
});

test("hanya jenis yang dikenal yang diterima", () => {
  assert.ok(isNotifKind("PELAYAN_H1"));
  assert.ok(isNotifKind("ULANG_TAHUN"));
  assert.ok(!isNotifKind("ASAL"));
});
