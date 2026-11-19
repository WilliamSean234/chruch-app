import { test } from "node:test";
import assert from "node:assert/strict";
import { nameKey } from "../src/lib/names";
import { rankMatches } from "../src/lib/personMatch";
import { isEmail, PASSWORD_MIN } from "../src/lib/passwordRules";

const P = (name: string) => ({ name, nameKey: nameKey(name) });
const names = (xs: { name: string }[]) => xs.map((x) => x.name);

test("nama lengkap yang lebih panjang tetap cocok dengan data yang lebih pendek", () => {
  const cands = [P("Jessica"), P("Budi Santoso"), P("Jessica Gabriella"), P("Grace Angelina")];
  const r = rankMatches("Jessica Gabriella Wahyudi", cands);
  assert.deepEqual(names(r), ["Jessica Gabriella", "Jessica"]); // yang paling banyak berbagi kata ada di atas
});

test("orang dengan nama yang tidak berhubungan tidak disarankan", () => {
  assert.deepEqual(rankMatches("Jessica Gabriella", [P("Budi Santoso"), P("Daniel Pratama")]), []);
});

test("singkatan atau awalan nama depan ikut disarankan, tetapi di bawah yang persis", () => {
  const r = rankMatches("Jessica Wahyudi", [P("Jess Wahyudi"), P("Jessica Wahyudi")]);
  assert.equal(names(r)[0], "Jessica Wahyudi");
  assert.ok(names(r).includes("Jess Wahyudi"));
});

test("gelar tidak mengganggu pencocokan", () => {
  const r = rankMatches("Daniel Pratama", [P("Ps. Daniel Pratama")]);
  assert.equal(r.length, 1);
});

test("batas jumlah saran dihormati dan nama kosong tidak menyarankan siapa pun", () => {
  const many = Array.from({ length: 20 }, (_, i) => P(`Jessica Nomor${String.fromCharCode(97 + i)}`));
  assert.equal(rankMatches("Jessica", many, 5).length, 5);
  assert.deepEqual(rankMatches("   ", many), []);
});

test("format email: yang benar lolos, yang salah ditolak", () => {
  for (const ok of ["a@b.co", "nama.belakang@gereja.or.id", "  spasi@depan.com  "]) assert.ok(isEmail(ok), ok);
  for (const bad of ["", "tanpa-at.com", "a@b", "a@b.", "a b@c.com", "@c.com", "a@@c.com"]) assert.ok(!isEmail(bad), bad);
});

test("kata sandi minimal 8 karakter", () => assert.equal(PASSWORD_MIN, 8));
