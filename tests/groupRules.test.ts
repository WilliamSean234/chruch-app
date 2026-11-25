import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditGroupMembers } from "../src/lib/groupRules";

test("anggota berjabatan pengelola boleh; yang lain tidak", () => {
  assert.equal(canEditGroupMembers({ isManagerMember: true, isSuperadmin: false }), true);
  assert.equal(canEditGroupMembers({ isManagerMember: false, isSuperadmin: false }), false);
});

test("Superadmin boleh mengatur anggota di kelompok mana pun, walau kelompok sudah punya pengelola", () => {
  assert.equal(canEditGroupMembers({ isManagerMember: false, isSuperadmin: true }), true);
  assert.equal(canEditGroupMembers({ isManagerMember: true, isSuperadmin: true }), true);
});
