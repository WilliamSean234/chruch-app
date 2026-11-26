import test from "node:test";
import assert from "node:assert/strict";
import { MAX_SUPERADMINS, needsSuperadminSlot, superadminSlotFull } from "../src/lib/superadminLimit";

test("batas dua Superadmin aktif", () => {
  assert.equal(MAX_SUPERADMINS, 2);
  assert.equal(superadminSlotFull(0), false);
  assert.equal(superadminSlotFull(1), false);
  assert.equal(superadminSlotFull(2), true);
  assert.equal(superadminSlotFull(3), true); // data lama yang sudah lebih tidak bisa menambah lagi
});

test("kapan sebuah perubahan butuh kursi Superadmin", () => {
  const on = { isSuper: true, active: true };
  assert.equal(needsSuperadminSlot(null, on), true); // akun Superadmin baru
  assert.equal(needsSuperadminSlot(null, { isSuper: false, active: true }), false);
  assert.equal(needsSuperadminSlot({ isSuper: false, active: true }, on), true); // diberi role Superadmin
  assert.equal(needsSuperadminSlot({ isSuper: true, active: false }, on), true); // Superadmin nonaktif diaktifkan lagi
  assert.equal(needsSuperadminSlot(on, on), false); // sudah Superadmin aktif: mengubah hal lain tidak butuh kursi
  assert.equal(needsSuperadminSlot(on, { isSuper: true, active: false }), false); // dinonaktifkan
  assert.equal(needsSuperadminSlot(on, { isSuper: false, active: true }), false); // role dicabut
  assert.equal(needsSuperadminSlot({ isSuper: true, active: false }, { isSuper: true, active: false }), false); // tetap nonaktif
});
