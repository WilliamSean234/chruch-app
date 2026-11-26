import test from "node:test";
import assert from "node:assert/strict";
import { effectiveLimit, rolesNeedingSlot, seatsFull, transferVerdict, validateLimits, type TransferActor, type TransferParty } from "../src/lib/roleTransferRules";

const party = (o: Partial<TransferParty> & { id: string }): TransferParty => ({ isActive: true, isOwner: false, isSuper: false, holds: false, ...o });
const owner: TransferActor = { id: "own", isSuper: true, isOwner: true };
const sup2: TransferActor = { id: "s2", isSuper: true, isOwner: false };
const adminJemaat: TransferActor = { id: "aj", isSuper: false, isOwner: false };

test("batas efektif: Superadmin dikunci 2; role yang bisa dibatasi memakai nilai tersimpan; sisanya tanpa batas", () => {
  assert.equal(effectiveLimit("SUPERADMIN", 9), 2);
  assert.equal(effectiveLimit("SUPERADMIN", null), 2);
  assert.equal(effectiveLimit("PENJADWAL", 3), 3);
  assert.equal(effectiveLimit("PENJADWAL", null), null);
  assert.equal(effectiveLimit("PELAYAN", 3), null); // Pelayan tidak bisa dibatasi
  assert.equal(effectiveLimit("PETUGAS_ABSEN", 3), null);
});

test("penuh bila ada batas dan semua terpakai", () => {
  assert.equal(seatsFull(null, 999), false);
  assert.equal(seatsFull(3, 2), false);
  assert.equal(seatsFull(3, 3), true);
});

test("role yang butuh kursi: baru dipegang atau akun nonaktif diaktifkan lagi", () => {
  const act = (codes: string[]) => ({ codes, active: true });
  assert.deepEqual(rolesNeedingSlot(null, act(["PENJADWAL", "PELAYAN"])), ["PENJADWAL", "PELAYAN"]); // akun baru
  assert.deepEqual(rolesNeedingSlot(act(["PELAYAN"]), act(["PELAYAN", "PENJADWAL"])), ["PENJADWAL"]); // role diberikan
  assert.deepEqual(rolesNeedingSlot(act(["PENJADWAL"]), act(["PENJADWAL"])), []); // tidak ada perubahan
  assert.deepEqual(rolesNeedingSlot(act(["PENJADWAL"]), act([])), []); // dicabut
  assert.deepEqual(rolesNeedingSlot({ codes: ["PENJADWAL"], active: false }, act(["PENJADWAL"])), ["PENJADWAL"]); // diaktifkan lagi
  assert.deepEqual(rolesNeedingSlot(act(["PENJADWAL"]), { codes: ["PENJADWAL"], active: false }), []); // dinonaktifkan
});

test("pengaturan batas: hanya role yang bisa dibatasi, 1..500, tidak di bawah jumlah pemegang", () => {
  assert.equal(validateLimits({ PENJADWAL: 3, ADMIN_TIM: null }, { PENJADWAL: 3 }), null);
  assert.match(validateLimits({ PENJADWAL: 2 }, { PENJADWAL: 3 })!, /tidak bisa di bawah 3/);
  assert.match(validateLimits({ SUPERADMIN: 3 }, {})!, /dikunci/);
  assert.match(validateLimits({ PELAYAN: 3 }, {})!, /tidak punya batas/);
  assert.match(validateLimits({ PENJADWAL: 0 }, {})!, /1 sampai 500/);
  assert.match(validateLimits({ PENJADWAL: 501 }, {})!, /1 sampai 500/);
  assert.match(validateLimits({ PENJADWAL: 1.5 }, {})!, /1 sampai 500/);
});

test("role biasa: boleh dipindah oleh yang mengelola akun", () => {
  assert.equal(transferVerdict("PENJADWAL", adminJemaat, party({ id: "a", holds: true }), party({ id: "b" })), null);
});

test("validasi dasar", () => {
  assert.match(transferVerdict("PENJADWAL", owner, party({ id: "a", holds: true }), party({ id: "a", holds: true }))!, /berbeda/);
  assert.match(transferVerdict("PENJADWAL", owner, party({ id: "a" }), party({ id: "b" }))!, /tidak memegang/);
  assert.match(transferVerdict("PENJADWAL", owner, party({ id: "a", holds: true }), party({ id: "b", holds: true }))!, /sudah memegang/);
  assert.match(transferVerdict("PENJADWAL", owner, party({ id: "a", holds: true }), party({ id: "b", isActive: false }))!, /nonaktif/);
});

test("Superadmin utama tetap dilindungi untuk role apa pun", () => {
  const o = party({ id: "own", isOwner: true, isSuper: true });
  assert.match(transferVerdict("PENJADWAL", sup2, party({ id: "a", holds: true }), o)!, /Superadmin utama/);
  assert.match(transferVerdict("PENJADWAL", sup2, { ...o, holds: true }, party({ id: "b" }))!, /Superadmin utama/);
  assert.equal(transferVerdict("PENJADWAL", owner, { ...o, holds: true }, party({ id: "b" })), null); // pemiliknya sendiri boleh
});

test("akun Superadmin hanya bisa diubah Superadmin", () => {
  assert.match(transferVerdict("PENJADWAL", adminJemaat, party({ id: "a", holds: true, isSuper: true }), party({ id: "b" }))!, /Superadmin/);
  assert.equal(transferVerdict("PENJADWAL", sup2, party({ id: "a", holds: true, isSuper: true }), party({ id: "b" })), null);
});

test("Pengawas hanya oleh Superadmin", () => {
  assert.match(transferVerdict("PENGAWAS", adminJemaat, party({ id: "a", holds: true }), party({ id: "b" }))!, /Pengawas/);
  assert.equal(transferVerdict("PENGAWAS", sup2, party({ id: "a", holds: true }), party({ id: "b" })), null);
});

test("role Superadmin: hanya Superadmin utama, dari akun aktif, bukan dari dirinya", () => {
  const from = party({ id: "s2", holds: true, isSuper: true });
  const to = party({ id: "new" });
  assert.equal(transferVerdict("SUPERADMIN", owner, from, to), null);
  assert.match(transferVerdict("SUPERADMIN", sup2, { ...from, id: "other" }, to)!, /Superadmin utama yang boleh/); // Superadmin biasa ditolak
  assert.match(transferVerdict("SUPERADMIN", adminJemaat, from, to)!, /Superadmin/);
  assert.match(transferVerdict("SUPERADMIN", owner, { ...from, id: "own", isOwner: true }, to)!, /tidak bisa dipindahkan/);
  assert.match(transferVerdict("SUPERADMIN", owner, { ...from, isActive: false }, to)!, /aktif/);
});
