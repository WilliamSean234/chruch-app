import test from "node:test";
import assert from "node:assert/strict";
import { blockedByOwner, OWNER_MESSAGE } from "../src/lib/ownerRules";

test("Superadmin utama hanya bisa diubah oleh dirinya sendiri", () => {
  const owner = { id: "u1", isOwner: true };
  assert.equal(blockedByOwner(owner, "u2"), true); // Superadmin lain
  assert.equal(blockedByOwner(owner, undefined), true); // tanpa pelaku yang dikenal
  assert.equal(blockedByOwner(owner, "u1"), false); // pemiliknya sendiri
  assert.equal(blockedByOwner({ id: "u3", isOwner: false }, "u2"), false); // akun biasa tidak dilindungi
  assert.match(OWNER_MESSAGE, /Superadmin utama/);
});
