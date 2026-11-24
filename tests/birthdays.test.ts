import { test } from "node:test";
import assert from "node:assert/strict";
import { birthdayInYear, birthdayMessage, birthdaysInRange, birthdaysOn, type BirthdayPerson } from "../src/lib/birthdays";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const p = (id: string, name: string, birth: string, nickname: string | null = null): BirthdayPerson => ({ id, name, nickname, birthDate: d(birth) });

test("tahun lahir tidak berpengaruh; tanggal jatuh di tahun yang diminta", () => {
  assert.equal(birthdayInYear(d("1990-11-24"), 2026), "2026-11-24");
  assert.equal(birthdayInYear(d("2005-01-05"), 2027), "2027-01-05");
});

test("lahir 29 Februari dirayakan 28 Februari di tahun biasa, 29 di tahun kabisat", () => {
  assert.equal(birthdayInYear(d("1992-02-29"), 2027), "2027-02-28");
  assert.equal(birthdayInYear(d("1992-02-29"), 2028), "2028-02-29");
  assert.equal(birthdayInYear(d("1992-02-29"), 2100), "2100-02-28");
});

test("rentang kalender: hanya yang jatuh di dalam rentang, urut tanggal lalu nama", () => {
  const people = [p("a", "Budi", "1980-11-10"), p("b", "Andi", "1985-11-10"), p("c", "Citra", "1990-12-01"), p("d", "Dewi", "1990-10-31")];
  const r = birthdaysInRange(people, "2026-11-01", "2026-11-30");
  assert.deepEqual(r.map((x) => [x.date, x.name]), [["2026-11-10", "Andi"], ["2026-11-10", "Budi"]]);
});

test("rentang melewati pergantian tahun", () => {
  const people = [p("a", "Eko", "1990-12-31"), p("b", "Fani", "1991-01-02"), p("c", "Gita", "1991-02-01")];
  const r = birthdaysInRange(people, "2026-12-28", "2027-01-10");
  assert.deepEqual(r.map((x) => x.date), ["2026-12-31", "2027-01-02"]);
});

test("nama panggilan dipakai bila ada", () => {
  assert.equal(birthdaysOn([p("a", "Yosi Hartono", "1970-03-03", " Ko Yosi ")], "2026-03-03")[0]!.name, "Ko Yosi");
  assert.equal(birthdaysOn([p("a", "Yosi Hartono", "1970-03-03", "  ")], "2026-03-03")[0]!.name, "Yosi Hartono");
  assert.equal(birthdaysOn([p("a", "Yosi", "1970-03-03")], "2026-03-04").length, 0);
});

test("teks notifikasi: satu orang, beberapa orang, dan banyak orang diringkas", () => {
  assert.equal(birthdayMessage(["Budi"]).body, "Hari ini Budi berulang tahun.");
  assert.equal(birthdayMessage(["A", "B"]).title, "2 orang berulang tahun");
  assert.equal(birthdayMessage(["A", "B"]).body, "Hari ini yang berulang tahun: A, B.");
  assert.equal(birthdayMessage(["A", "B", "C", "D", "E", "F"]).body, "Hari ini yang berulang tahun: A, B, C, D, +2 lainnya.");
});
