import test from "node:test";
import assert from "node:assert/strict";
import { roleIsFull, roleLimit, transferVerdict, type TransferActor, type TransferParty } from "../src/lib/roleTransferRules";

const party = (o: Partial<TransferParty> & { id: string }): TransferParty => ({ isActive: true, isOwner: false, isSuper: false, holds: false, ...o });
const owner: TransferActor = { id: "own", isSuper: true, isOwner: true };
const sup2: TransferActor = { id: "s2", isSuper: true, isOwner: false };
const adminJemaat: TransferActor = { id: "aj", isSuper: false, isOwner: false };

test("batas role: hanya Superadmin yang dibatasi (2)", () => {
  assert.equal(roleLimit("SUPERADMIN"), 2);
  assert.equal(roleLimit("PENJADWAL"), null);
  assert.equal(roleIsFull("SUPERADMIN", 1), false);
  assert.equal(roleIsFull("SUPERADMIN", 2), true);
  assert.equal(roleIsFull("PENJADWAL", 999), false);
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
