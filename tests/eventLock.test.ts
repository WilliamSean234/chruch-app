import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonthsYmd, attendanceWriteBlock, isLockedByAge } from "@/lib/eventStatusFlow";
import { zonedToUtc } from "@/lib/time";

const at = (d: string, t = "09:00") => zonedToUtc(d, t);

test("tambah bulan: akhir bulan dan pergantian tahun", () => {
  assert.equal(addMonthsYmd("2026-10-31", 1), "2026-11-30");
  assert.equal(addMonthsYmd("2026-12-15", 2), "2027-02-15");
  assert.equal(addMonthsYmd("2026-12-31", 2), "2027-02-28");
  assert.equal(addMonthsYmd("2026-11-22", 1), "2026-12-22");
});

test("kunci ibadah: bebas sampai tanggal sama 2 bulan kemudian, terkunci sesudahnya", () => {
  const ev = at("2026-09-20");
  assert.equal(isLockedByAge(ev, at("2026-11-20", "23:30")), false); // hari terakhir masih boleh
  assert.equal(isLockedByAge(ev, at("2026-11-21", "00:10")), true);
  assert.equal(isLockedByAge(at("2026-11-22"), at("2026-11-21")), false); // acara di depan
});

test("kehadiran: boleh mulai tanggal ibadah sampai 1 bulan sesudahnya (isi pertama maupun ubah)", () => {
  const ev = at("2026-11-22", "07:00");
  assert.match(attendanceWriteBlock(ev, false, at("2026-11-21", "23:00"))!, /tanggal ibadah/); // masa depan ditolak
  assert.match(attendanceWriteBlock(ev, true, at("2026-11-21"))!, /tanggal ibadah/);
  assert.equal(attendanceWriteBlock(ev, false, at("2026-11-22", "00:05")), null); // hari-H boleh
  assert.equal(attendanceWriteBlock(ev, false, at("2026-11-25")), null); // lupa isi, menyusul
  assert.equal(attendanceWriteBlock(ev, true, at("2026-12-22", "23:30")), null); // hari terakhir
  assert.match(attendanceWriteBlock(ev, false, at("2026-12-23", "00:30"))!, /1 bulan/);
  assert.match(attendanceWriteBlock(ev, true, at("2026-12-23", "00:30"))!, /1 bulan/);
});
