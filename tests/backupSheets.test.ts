import { test } from "node:test";
import assert from "node:assert/strict";
import { backupFileName, backupFrom, birthText, dateText, joinNames, noteSheet, sheetName, tableSheet, timeText } from "../src/lib/backupSheets";

test("nama lembar dibersihkan, dipotong 31 huruf, dan dibuat unik", () => {
  const used = new Set<string>();
  assert.equal(sheetName("Orang", used), "Orang");
  assert.equal(sheetName("orang", used), "orang 2"); // tidak membedakan huruf besar kecil
  assert.equal(sheetName("Tim: posisi/pelayanan [A]", used), "Tim posisi pelayanan A");
  assert.equal(sheetName("", used), "Lembar");
  const long = sheetName("x".repeat(60), used);
  assert.equal(long.length, 31);
  const again = sheetName("x".repeat(60), used);
  assert.ok(again.length <= 31 && again !== long);
});

test("lembar tabel: judul di baris 1, data mulai baris 2, sel kosong tetap ada", () => {
  const s = tableSheet("T", [{ head: "A", width: 10 }, { head: "B", width: 20 }], [["x", 3], [null, undefined]]);
  assert.deepEqual(s.cols, [10, 20]);
  const at = (r: number, c: number) => s.cells.find((x) => x.r === r && x.c === c)!;
  assert.equal(at(1, 1).v, "A");
  assert.equal(at(1, 2).s, "head");
  assert.equal(at(2, 2).v, 3);
  assert.equal(at(3, 1).v, "");
  assert.equal(at(3, 2).v, "");
  assert.equal(s.cells.length, 6);
});

test("lembar petunjuk: baris berawalan # menjadi tebal", () => {
  const s = noteSheet("P", ["# Judul", "isi"]);
  assert.equal(s.cells[0]!.v, "Judul");
  assert.equal(s.cells[0]!.s, "bold");
  assert.equal(s.cells[1]!.s, "plain");
});

test("tanggal dan jam memakai waktu Jakarta; tanggal lahir apa adanya", () => {
  const d = new Date("2026-11-25T18:30:00Z"); // 26 Nov 01:30 WIB
  assert.equal(dateText(d), "2026-11-26");
  assert.equal(timeText(d), "01:30");
  assert.equal(dateText(null), "");
  assert.equal(timeText(undefined), "");
  assert.equal(birthText(new Date("1990-03-07T00:00:00Z")), "1990-03-07");
  assert.equal(backupFileName(new Date("2026-11-25T03:00:00Z")), "CADANGAN_GEREJA_2026-11-25.xlsx");
});

test("jadwal dicadangkan 12 bulan ke belakang", () => {
  assert.equal(backupFrom(new Date("2026-11-25T03:00:00Z")).toISOString(), "2025-11-25T03:00:00.000Z");
});

test("daftar nama: tanpa kosong, tanpa kembar, urut abjad", () => {
  assert.equal(joinNames(["Budi", null, "Ani", "Budi", ""]), "Ani, Budi");
  assert.equal(joinNames([]), "");
});
