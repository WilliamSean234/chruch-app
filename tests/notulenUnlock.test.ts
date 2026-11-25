import { test } from "node:test";
import assert from "node:assert/strict";
import { cookieValue, readUnlock, signUnlock, UNLOCK_TTL_MS } from "../src/lib/notulenUnlock";

const S = "rahasia-uji";
const NOW = 1_800_000_000_000;

test("bukti yang baru dibuat sah untuk akun dan sesi yang sama, sampai kedaluwarsa", () => {
  const t = signUnlock(S, "u1", 111, NOW);
  const ok = readUnlock(S, t, "u1", 111, NOW + 1000);
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.expiresAt, NOW + UNLOCK_TTL_MS);
  assert.equal(readUnlock(S, t, "u1", 111, NOW + UNLOCK_TTL_MS - 1).ok, true);
  assert.equal(readUnlock(S, t, "u1", 111, NOW + UNLOCK_TTL_MS).ok, false); // tepat kedaluwarsa = tidak sah
  assert.equal(readUnlock(S, t, "u1", 111, NOW + UNLOCK_TTL_MS + 5000).ok, false);
});

test("tidak berlaku untuk akun lain, sesi lain, atau kunci rahasia lain", () => {
  const t = signUnlock(S, "u1", 111, NOW);
  assert.equal(readUnlock(S, t, "u2", 111, NOW + 1).ok, false);
  assert.equal(readUnlock(S, t, "u1", 222, NOW + 1).ok, false); // masuk ulang / ganti kata sandi = authAt baru
  assert.equal(readUnlock(S, t, "u1", undefined, NOW + 1).ok, false);
  assert.equal(readUnlock("rahasia-lain", t, "u1", 111, NOW + 1).ok, false);
});

test("sesi tanpa authAt tetap konsisten", () => {
  const t = signUnlock(S, "u1", undefined, NOW);
  assert.equal(readUnlock(S, t, "u1", undefined, NOW + 1).ok, true);
  assert.equal(readUnlock(S, t, "u1", 0, NOW + 1).ok, true); // undefined dan 0 diperlakukan sama
});

test("bukti yang diubah atau rusak ditolak", () => {
  const t = signUnlock(S, "u1", 111, NOW);
  const [exp, sig] = t.split(".");
  assert.equal(readUnlock(S, `${Number(exp) + 1000}.${sig}`, "u1", 111, NOW + 1).ok, false); // kedaluwarsa dimundurkan
  assert.equal(readUnlock(S, `${exp}.${sig!.slice(0, -2)}xx`, "u1", 111, NOW + 1).ok, false);
  assert.equal(readUnlock(S, `${exp}.`, "u1", 111, NOW + 1).ok, false);
  assert.equal(readUnlock(S, "", "u1", 111, NOW + 1).ok, false);
  assert.equal(readUnlock(S, null, "u1", 111, NOW + 1).ok, false);
  assert.equal(readUnlock(S, undefined, "u1", 111, NOW + 1).ok, false);
  assert.equal(readUnlock(S, "abc.def", "u1", 111, NOW + 1).ok, false);
  assert.equal(readUnlock(S, `.${sig}`, "u1", 111, NOW + 1).ok, false);
});

test("kedaluwarsa yang terlalu jauh di depan ditolak walau tanda tangannya cocok", () => {
  const t = signUnlock(S, "u1", 111, NOW, UNLOCK_TTL_MS * 24); // dibuat dengan masa berlaku 24 kali lebih lama
  assert.equal(readUnlock(S, t, "u1", 111, NOW + 1).ok, false);
});

test("nilai cookie diambil dari header", () => {
  assert.equal(cookieValue("a=1; notulen_unlock=123.abc; b=2", "notulen_unlock"), "123.abc");
  assert.equal(cookieValue("notulen_unlock=x%2By", "notulen_unlock"), "x+y");
  assert.equal(cookieValue("a=1", "notulen_unlock"), null);
  assert.equal(cookieValue("", "notulen_unlock"), null);
  assert.equal(cookieValue(null, "notulen_unlock"), null);
  assert.equal(cookieValue("xnotulen_unlock=1", "notulen_unlock"), null); // nama harus persis
});
