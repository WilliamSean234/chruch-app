import { test } from "node:test";
import assert from "node:assert/strict";
import { can, canManagePeople, canSeeDraftEvents, isSuperadmin, requireManagePeople, requirePermission, requirePersonInScope, teamScope, type AuthUser } from "../src/lib/rbac";

const user = (roles: AuthUser["roles"], permissions: string[] = []): AuthUser => ({ userId: "u", tenantId: "t", personId: null, roles, permissions });
const role = (code: string, teamTypeId: string | null = null, isSuperadmin = false) => ({ code, isSuperadmin, teamTypeId });

test("setiap orang boleh melihat kalender dan jadwalnya sendiri", () => {
  const u = user([role("PELAYAN")]);
  assert.equal(can(u, "calendar.read"), true);
  assert.equal(can(u, "schedule.read-own"), true);
  assert.equal(can(u, "event.write"), false);
});

test("Superadmin melewati semua izin", () => {
  const u = user([role("SUPERADMIN", null, true)]);
  assert.equal(isSuperadmin(u), true);
  assert.equal(can(u, "user.manage"), true);
});

test("izin lain hanya bila diberikan role", () => {
  const u = user([role("PETUGAS_ABSEN")], ["attendance.write"]);
  assert.equal(can(u, "attendance.write"), true);
  assert.equal(can(u, "person.write"), false);
  assert.throws(() => requirePermission(u, "person.write"));
  assert.doesNotThrow(() => requirePermission(u, "attendance.write"));
});

test("cakupan tim: Penjadwal tanpa batas, Admin Tim dibatasi", () => {
  assert.equal(teamScope(user([role("SUPERADMIN", null, true)])), null);
  assert.equal(teamScope(user([role("PENJADWAL")])), null);
  assert.deepEqual(teamScope(user([role("ADMIN_TIM", "tim-1"), role("ADMIN_TIM", "tim-2")])), ["tim-1", "tim-2"]);
  assert.equal(teamScope(user([role("ADMIN_TIM", null)])), null);
  assert.deepEqual(teamScope(user([role("ADMIN_TIM", "tim-1"), role("PELAYAN")])), ["tim-1"]);
});

test("Admin Tim hanya boleh mengubah data orang yang melayani di timnya", () => {
  const ebm = user([role("ADMIN_TIM", "tim-ebm")], ["person.write"]);
  assert.doesNotThrow(() => requirePersonInScope(ebm, ["tim-usher", "tim-ebm"])); // salah satu pelayanannya di tim EBM
  assert.throws(() => requirePersonInScope(ebm, ["tim-usher"]), /tim Anda/);
  assert.throws(() => requirePersonInScope(ebm, []), /tim Anda/); // belum punya pelayanan: Admin Tim tidak boleh mengubah
});

test("Penjadwal dan Superadmin boleh mengubah data siapa pun", () => {
  assert.doesNotThrow(() => requirePersonInScope(user([role("PENJADWAL")], ["person.write"]), []));
  assert.doesNotThrow(() => requirePersonInScope(user([role("SUPERADMIN", null, true)]), ["tim-usher"]));
});

test("Pengawas hanya membaca log: tanpa izin ubah dan tanpa cakupan tim", () => {
  const u = user([role("PENGAWAS")], ["audit.read", "calendar.read", "schedule.read-own"]);
  assert.equal(can(u, "audit.read"), true);
  assert.equal(can(u, "user.manage"), false);
  assert.equal(can(u, "assignment.write"), false);
  assert.equal(can(u, "event.write"), false);
  assert.deepEqual(teamScope(u), []); // tidak boleh mengatur tim mana pun
  assert.equal(can(user([role("PELAYAN")], ["calendar.read"]), "audit.read"), false);
});

test("hanya Superadmin dan Admin Jemaat (izin person.manage) yang boleh menambah atau mengubah data orang", () => {
  assert.equal(canManagePeople(user([role("SUPERADMIN", null, true)])), true);
  const jemaat = user([role("ADMIN_JEMAAT")], ["person.write", "person.manage"]);
  assert.equal(canManagePeople(jemaat), true);
  assert.equal(teamScope(jemaat), null); // Admin Jemaat tidak dibatasi tim
  assert.doesNotThrow(() => requireManagePeople(jemaat));
  const penjadwal = user([role("PENJADWAL")], ["person.write", "event.write"]);
  assert.equal(canManagePeople(penjadwal), false);
  assert.throws(() => requireManagePeople(penjadwal), /Admin Jemaat/);
  const adminTim = user([role("ADMIN_TIM", "tim-ebm")], ["person.write"]);
  assert.equal(canManagePeople(adminTim), false);
  assert.equal(canManagePeople(user([role("PELAYAN")])), false);
  assert.equal(canManagePeople(user([role("PETUGAS_ABSEN")], ["attendance.write"])), false);
});

test("Penjadwal tidak lagi punya izin master data (ruangan, tim, posisi)", () => {
  assert.equal(can(user([role("PENJADWAL")], ["person.write", "event.write"]), "master.write"), false);
  assert.equal(can(user([role("SUPERADMIN", null, true)]), "master.write"), true);
});

test("acara DRAFT hanya terlihat oleh yang mengatur acara (Superadmin dan Penjadwal), bukan Admin Tim", () => {
  assert.equal(canSeeDraftEvents(user([role("SUPERADMIN", null, true)])), true);
  assert.equal(canSeeDraftEvents(user([role("PENJADWAL")], ["event.write"])), true);
  assert.equal(canSeeDraftEvents(user([role("ADMIN_TIM", "tim-1")], ["assignment.write", "rehearsal.write", "person.write"])), false);
  assert.equal(canSeeDraftEvents(user([role("PELAYAN")])), false);
});
