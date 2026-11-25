import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditGroupMembers } from "../src/lib/groupRules";

test("anggota berjabatan pengelola boleh; yang lain tidak", () => {
  assert.equal(canEditGroupMembers({ isManagerMember: true, isSuperadmin: false, groupHasManager: true }), true);
  assert.equal(canEditGroupMembers({ isManagerMember: false, isSuperadmin: false, groupHasManager: true }), false);
  assert.equal(canEditGroupMembers({ isManagerMember: false, isSuperadmin: false, groupHasManager: false }), false);
});

test("Superadmin tidak boleh bila kelompok sudah punya pengelola anggota", () => {
  assert.equal(canEditGroupMembers({ isManagerMember: false, isSuperadmin: true, groupHasManager: true }), false);
});

test("Superadmin hanya boleh sebagai jalan keluar bila kelompok belum punya pengelola anggota", () => {
  assert.equal(canEditGroupMembers({ isManagerMember: false, isSuperadmin: true, groupHasManager: false }), true);
});
