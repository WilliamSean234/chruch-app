import { test } from "node:test";
import assert from "node:assert/strict";
import { isNotifKind, kindsFor, NOTIF_KINDS } from "../src/lib/notificationKinds";

test("setiap jenis notifikasi punya kunci unik", () => {
  assert.equal(new Set(NOTIF_KINDS.map((k) => k.kind)).size, NOTIF_KINDS.length);
});

test("jenis yang ditampilkan mengikuti peran akun", () => {
  assert.deepEqual(kindsFor(["PELAYAN"]).map((k) => k.audience), ["PELAYAN", "PELAYAN", "PELAYAN", "PELAYAN"]);
  assert.ok(kindsFor(["PELAYAN", "PENJADWAL", "KELOMPOK"]).length === NOTIF_KINDS.length);
  assert.equal(kindsFor([]).length, 0);
});

test("hanya jenis yang dikenal yang diterima", () => {
  assert.ok(isNotifKind("PELAYAN_H1"));
  assert.ok(!isNotifKind("ASAL"));
});
