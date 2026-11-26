import test from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, groupSecret, hashRecovery, kindOfCode, matchTotp, newRecoveryCodes, newSecret, normalizeRecovery, otpauthUri, totpCode } from "../src/lib/totp";

// Vektor uji resmi RFC 6238 (SHA-1, kunci ASCII "12345678901234567890"); 6 digit = 6 digit terakhir dari nilai 8 digit di RFC.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const VECTORS: [number, string][] = [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"]];

test("base32 bolak-balik dan menolak karakter asing", () => {
  assert.equal(RFC_SECRET, "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(base32Decode(RFC_SECRET)?.toString(), "12345678901234567890");
  assert.equal(base32Decode("gezd gnbv-gy3t qojq gezd gnbv gy3t qojq")?.toString(), "12345678901234567890");
  assert.equal(base32Decode("ABC1"), null); // angka 1 bukan base32
  assert.equal(base32Decode(""), null);
  const s = newSecret();
  assert.equal(s.length, 32);
  assert.equal(base32Encode(base32Decode(s)!), s);
});

test("kode TOTP cocok dengan vektor RFC 6238", () => {
  for (const [t, code] of VECTORS) assert.equal(totpCode(RFC_SECRET, t * 1000), code, `t=${t}`);
});

test("matchTotp: toleransi satu langkah, kode lama atau jauh ditolak, mengembalikan nomor langkah", () => {
  const now = 1234567890 * 1000;
  const step = Math.floor(now / 30000);
  assert.equal(matchTotp(RFC_SECRET, "005924", now), step);
  assert.equal(matchTotp(RFC_SECRET, "005 924", now), step); // spasi diabaikan
  assert.equal(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, now, -1)!, now), step - 1);
  assert.equal(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, now, 1)!, now), step + 1);
  assert.equal(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, now, -2)!, now), null);
  assert.equal(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, now, 2)!, now), null);
  assert.equal(matchTotp(RFC_SECRET, "12345", now), null);
  assert.equal(matchTotp(RFC_SECRET, "abcdef", now), null);
  assert.equal(matchTotp("bukan base32!", "005924", now), null);
});

test("tautan otpauth dan penulisan kunci manual", () => {
  const uri = otpauthUri({ secret: "ABCDEFGH", account: "a b@x.com", issuer: "Jadwal Elyon" });
  assert.equal(uri, "otpauth://totp/Jadwal%20Elyon:a%20b%40x.com?secret=ABCDEFGH&issuer=Jadwal%20Elyon");
  assert.equal(groupSecret("ABCDEFGHIJKL"), "ABCD EFGH IJKL");
});

test("kode cadangan: bentuk, unik, normalisasi, hash stabil", () => {
  const codes = newRecoveryCodes(8);
  assert.equal(new Set(codes).size, 8);
  for (const c of codes) assert.match(c, /^[A-HJ-NP-Z2-7]{5}-[A-HJ-NP-Z2-7]{5}$/);
  const c = codes[0]!;
  assert.equal(normalizeRecovery(c.toLowerCase()), c.replace("-", ""));
  assert.equal(hashRecovery(c), hashRecovery(c.toLowerCase().replace("-", " ")));
  assert.notEqual(hashRecovery(c), hashRecovery(codes[1]!));
});

test("kindOfCode membedakan kode 6 angka dan kode cadangan", () => {
  assert.equal(kindOfCode("123456"), "totp");
  assert.equal(kindOfCode("123 456"), "totp");
  assert.equal(kindOfCode("K7QX2-M4RTA"), "recovery");
  assert.equal(kindOfCode("k7qx2m4rta"), "recovery");
  assert.equal(kindOfCode("12345"), null);
  assert.equal(kindOfCode(""), null);
});
