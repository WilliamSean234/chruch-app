import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditGroupMembers, canManageGroupPositions, isAdminTimName } from "../src/lib/groupRules";

test("anggota berjabatan pengelola boleh; yang lain tidak", () => {
  assert.equal(canEditGroupMembers({ isManagerMember: true, isSuperadmin: false, groupHasAdminTim: true }), true);
  assert.equal(canEditGroupMembers({ isManagerMember: false, isSuperadmin: false, groupHasAdminTim: false }), false);
});

test("Superadmin boleh mengatur anggota hanya selama kelompok belum punya Admin Tim", () => {
  assert.equal(canEditGroupMembers({ isManagerMember: false, isSuperadmin: true, groupHasAdminTim: false }), true);
  assert.equal(canEditGroupMembers({ isManagerMember: false, isSuperadmin: true, groupHasAdminTim: true }), false);
});

test("Superadmin yang sendiri memegang jabatan pengelola tetap boleh", () => {
  assert.equal(canEditGroupMembers({ isManagerMember: true, isSuperadmin: true, groupHasAdminTim: true }), true);
});

test("nama Admin Tim dikenali tanpa memandang huruf besar dan spasi", () => {
  assert.equal(isAdminTimName(" admin tim "), true);
  assert.equal(isAdminTimName("Admin Tim EBM"), false);
});

test("jabatan kelompok: Admin Tim kelompok itu boleh; Superadmin hanya selama belum ada Admin Tim", () => {
  assert.equal(canManageGroupPositions({ isAdminTimMember: true, isSuperadmin: false, groupHasAdminTim: true }), true);
  assert.equal(canManageGroupPositions({ isAdminTimMember: false, isSuperadmin: true, groupHasAdminTim: false }), true);
  assert.equal(canManageGroupPositions({ isAdminTimMember: false, isSuperadmin: true, groupHasAdminTim: true }), false);
  assert.equal(canManageGroupPositions({ isAdminTimMember: false, isSuperadmin: false, groupHasAdminTim: false }), false);
});
