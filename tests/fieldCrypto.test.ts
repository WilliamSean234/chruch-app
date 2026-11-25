import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.MINUTES_ENC_KEY = randomBytes(32).toString("base64");
const { decryptText, encryptText, ensureEncrypted, isEncrypted } = await import("../src/lib/fieldCrypto");

test("enkripsi bolak-balik; hasilnya bukan teks asli dan acak tiap kali", () => {
  const a = encryptText("Keputusan: beli proyektor", "minutes:e1", "decisions");
  const b = encryptText("Keputusan: beli proyektor", "minutes:e1", "decisions");
  assert.ok(isEncrypted(a));
  assert.ok(!a.includes("proyektor"));
  assert.notEqual(a, b);
  assert.equal(decryptText(a, "minutes:e1", "decisions"), "Keputusan: beli proyektor");
});

test("teks kosong tetap kosong; teks lama tanpa awalan terbaca apa adanya", () => {
  assert.equal(encryptText("", "minutes:e1", "agenda"), "");
  assert.equal(decryptText("catatan lama", "minutes:e1", "agenda"), "catatan lama");
  assert.ok(isEncrypted(ensureEncrypted("catatan lama", "minutes:e1", "agenda")));
  const once = ensureEncrypted("x", "minutes:e1", "agenda");
  assert.equal(ensureEncrypted(once, "minutes:e1", "agenda"), once);
});

test("isi tidak bisa dipindah ke rapat atau kolom lain", () => {
  const c = encryptText("rahasia", "minutes:e1", "agenda");
  assert.throws(() => decryptText(c, "minutes:e2", "agenda"));
  assert.throws(() => decryptText(c, "minutes:e1", "decisions"));
});

test("data diubah di database = gagal dibuka; kunci beda = gagal dibuka", () => {
  const c = encryptText("rahasia", "minutes:e1", "agenda");
  const bytes = Buffer.from(c.slice(7), "base64"); bytes[bytes.length - 1] ^= 1;
  assert.throws(() => decryptText("enc:v1:" + bytes.toString("base64"), "minutes:e1", "agenda"));
  process.env.MINUTES_ENC_KEY = randomBytes(32).toString("base64");
  assert.throws(() => decryptText(c, "minutes:e1", "agenda"));
});

test("tanpa kunci: menulis ditolak, tidak diam-diam jadi teks biasa", () => {
  delete process.env.MINUTES_ENC_KEY;
  assert.throws(() => encryptText("rahasia", "minutes:e1", "agenda"), /kunci enkripsi/i);
});
