import { test } from "node:test";
import assert from "node:assert/strict";
import { ageFrom, nameKey } from "../src/lib/names";
import { initials, toneFor } from "../src/lib/ui";

test("kunci nama: tanpa gelar dan tanda baca, huruf kecil", () => {
  assert.equal(nameKey("Pdt. Budi  Santoso"), "budi santoso");
  assert.equal(nameKey("Ibu Ani"), "ani");
  assert.equal(nameKey("ANNA   Margareta"), "anna margareta");
  assert.equal(nameKey("Dr"), "dr"); // satu kata tidak dibuang
});

test("nama yang sama dengan penulisan berbeda memberi kunci yang sama", () => {
  assert.equal(nameKey("Ps. Chen"), nameKey("ps chen"));
});

test("usia penuh menurut zona waktu gereja", () => {
  const now = new Date("2026-11-19T03:00:00Z");
  assert.equal(ageFrom(new Date("1997-03-03T00:00:00Z"), now), 29);
  assert.equal(ageFrom(new Date("1997-12-01T00:00:00Z"), now), 28); // belum ulang tahun tahun ini
  assert.equal(ageFrom(null, now), null);
});

test("inisial dan warna acara", () => {
  assert.equal(initials("Anna Margareta Sari"), "AM");
  assert.equal(initials("Anna"), "A");
  assert.equal(toneFor("Ibadah Minggu I").short, "Minggu I");
  assert.notEqual(toneFor("Ibadah Mandarin").dot, toneFor("Fellowship Pemuda").dot);
});
