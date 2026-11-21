import { test } from "node:test";
import assert from "node:assert/strict";
import { can, isSuperadmin, requirePermission, requirePersonInScope, teamScope, type AuthUser } from "../src/lib/rbac";

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
