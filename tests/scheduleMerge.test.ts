import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeModels } from "../src/lib/scheduleMerge";
import type { ExportModel } from "../src/lib/teamSchedule";

const ebm: ExportModel = {
  format: "ebm", title: "JADWAL TIM EBM", year: 2027, teamShort: "EBM",
  columns: [{ key: "pic", label: "PIC" }, { key: "soundman", label: "SOUNDMAN" }],
  groups: null,
  months: [{ month: 1, name: "JANUARI", rows: [
    { date: "2027-01-03", day: 3, cells: { pic: "Andi", soundman: "Budi / Candra" }, differs: true },
    { date: "2027-01-10", day: 10, cells: { pic: "", soundman: "Dedi" }, differs: false },
  ] }],
  hasDiff: true,
};
const usher: ExportModel = {
  format: "usher", title: "JADWAL USHER", year: 2027, teamShort: "Usher",
  columns: [{ key: "s1_1", label: "KU1 #1" }, { key: "s2_1", label: "KU2 #1" }],
  groups: [{ label: "KU1", keys: ["s1_1"] }, { label: "KU2", keys: ["s2_1"] }],
  months: [{ month: 1, name: "JANUARI", rows: [
    { date: "2027-01-03", day: 3, cells: { s1_1: "Eko", s2_1: "Fani" }, differs: false },
    { date: "2027-01-10", day: 10, cells: { s1_1: "", s2_1: "Gita" }, differs: false },
  ] }],
  hasDiff: false,
};
const pen: ExportModel = {
  format: "penatalayan", title: "JADWAL PENATALAYAN", year: 2027, teamShort: "Penatalayan", pen: true,
  columns: [{ key: "lit", label: "Liturgos" }, { key: "@theme", label: "Tema" }],
  groups: [{ label: "Liturgos", keys: ["lit"], single: true }, { label: "Tema", keys: ["@theme"], single: true }],
  months: [{ month: 1, name: "JANUARI", rows: [
    { date: "2027-01-03", day: 3, cells: { lit: "Hana", "@theme": "Kasih" }, differs: false },
    { date: "2027-01-10", day: 10, cells: { lit: "Ivan", "@theme": "" }, differs: false },
  ] }],
  hasDiff: false,
};

test("satu tim: dikembalikan apa adanya", () => {
  assert.equal(mergeModels([ebm]), ebm);
});

test("beberapa tim: kolom berdampingan, tiap tim satu kelompok", () => {
  const m = mergeModels([ebm, usher, pen]);
  assert.equal(m.multi, true);
  assert.equal(m.pen, true);
  assert.equal(m.format, "gabungan");
  assert.equal(m.title, "JADWAL EBM + USHER + PENATALAYAN");
  assert.deepEqual(m.columns.map((c) => c.key), ["ebm:pic", "ebm:soundman", "usher:s1_1", "usher:s2_1", "penatalayan:lit", "@theme"]);
  assert.deepEqual(m.groups!.map((g) => g.label), ["EBM", "Usher", "Penatalayan"]);
  assert.deepEqual(m.groups![2]!.keys, ["penatalayan:lit", "@theme"]);
  assert.ok(!m.groups!.some((g) => g.single), "kelompok tim tidak boleh 'single' agar nama kolom tetap tampil");
});

test("isi sel mengikuti tanggal dan kolom tiap tim", () => {
  const m = mergeModels([ebm, usher, pen]);
  const rows = m.months[0]!.rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0]!.cells, { "ebm:pic": "Andi", "ebm:soundman": "Budi / Candra", "usher:s1_1": "Eko", "usher:s2_1": "Fani", "penatalayan:lit": "Hana", "@theme": "Kasih" });
  assert.equal(rows[1]!.cells["usher:s2_1"], "Gita");
  assert.equal(rows[1]!.cells["@theme"], "");
});

test("tanda beda Ibadah I/II terbawa", () => {
  const m = mergeModels([ebm, usher]);
  assert.equal(m.hasDiff, true);
  assert.equal(m.months[0]!.rows[0]!.differs, true);
  assert.equal(m.months[0]!.rows[1]!.differs, false);
  assert.equal(mergeModels([usher, pen]).hasDiff, false);
});

test("dua tim dengan kunci kolom sama tidak bertabrakan", () => {
  const a: ExportModel = { ...ebm, format: "a", teamShort: "A", columns: [{ key: "pic", label: "PIC" }] };
  const b: ExportModel = { ...ebm, format: "b", teamShort: "B", columns: [{ key: "pic", label: "PIC" }] };
  const m = mergeModels([a, b]);
  assert.equal(new Set(m.columns.map((c) => c.key)).size, 2);
});
