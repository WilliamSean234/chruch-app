import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditGroupMembers, canManageGroupPositions, elevatedChanged, isAdminTimName, isElevatedPosition } from "../src/lib/groupRules";

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

test("jabatan berhak khusus: memberi atau mencabutnya terdeteksi; jabatan biasa tidak", () => {
  const el = ["adm", "sekr"]; // Admin Tim dan Sekretaris (boleh menulis notulen)
  assert.equal(elevatedChanged(el, [], ["adm"]), true); // dijadikan Admin Tim
  assert.equal(elevatedChanged(el, ["adm", "ketua"], ["ketua"]), true); // Admin Tim dicabut
  assert.equal(elevatedChanged(el, ["adm"], []), true); // dikeluarkan
  assert.equal(elevatedChanged(el, ["anggota"], ["sekr"]), true); // jadi penulis notulen
  assert.equal(elevatedChanged(el, ["sekr"], ["adm"]), true); // berganti hak khusus
  assert.equal(elevatedChanged(el, ["adm"], ["adm", "anggota"]), false); // tetap sama
  assert.equal(elevatedChanged(el, ["anggota"], ["biasa"]), false); // jabatan biasa saja
  assert.equal(elevatedChanged([], ["ketua"], ["adm"]), false); // tidak ada jabatan khusus
});

test("jabatan dikenali berhak khusus bila Admin Tim atau punya salah satu hak", () => {
  const none = { canSchedule: false, canWriteMinutes: false, canFinalize: false, canManageMembers: false };
  assert.equal(isElevatedPosition({ name: "Anggota", ...none }), false);
  assert.equal(isElevatedPosition({ name: "admin tim ", ...none }), true);
  assert.equal(isElevatedPosition({ name: "Sekretaris", ...none, canWriteMinutes: true }), true);
  assert.equal(isElevatedPosition({ name: "Ketua", ...none, canManageMembers: true }), true);
  assert.equal(isElevatedPosition({ name: "Bendahara", ...none, canSchedule: true }), true);
});
