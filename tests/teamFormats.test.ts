import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readXlsx } from "../src/lib/importer/xlsx";
import { buildXlsx, type XCell } from "../src/lib/xlsxWrite";
import { EBM_FORMAT, matchName, monthOf, parseTeamSheet, suggestMinistryName, type Candidate } from "../src/lib/teamFormats";

const sample = () => readXlsx(readFileSync(join(__dirname, "fixtures", "JADWAL_EBM_2027.xlsx")));

test("nama bulan dikenali, termasuk salah ketik", () => {
  assert.equal(monthOf("JANUARI"), 1);
  assert.equal(monthOf("FEBUARI"), 2);
  assert.equal(monthOf("MEI"), 5);
  assert.equal(monthOf("MEJA"), null);
  assert.equal(monthOf("YOSI"), null);
});

test("file jadwal EBM 2027 asli terbaca: semua hari Minggu, tanpa galat", () => {
  const r = parseTeamSheet(sample(), EBM_FORMAT, 2027);
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows.length, 52);
  const first = r.rows[0]!;
  assert.equal(first.date, "2027-01-03");
  assert.equal(first.names.pic, "YUDHISTIRA");
  assert.equal(first.names.easyworship, "HANS"); // header "EASY WORSHIP LED " ada spasi di belakang
  assert.equal(first.names.bm, "REYNARD");
  assert.equal(r.rows[4]!.date, "2027-01-31");
  assert.ok(r.rows.every((x) => new Date(`${x.date}T00:00:00Z`).getUTCDay() === 0));
});

test("tahun yang salah ditolak per baris karena bukan hari Minggu", () => {
  const r = parseTeamSheet(sample(), EBM_FORMAT, 2026);
  assert.ok(r.errors.length > 0);
  assert.match(r.errors[0]!.message, /bukan hari Minggu/);
});

test("template yang ditulis aplikasi terbaca kembali", () => {
  const cells: XCell[] = [{ r: 3, c: 3, v: "JANUARI", s: "title" }, { r: 4, c: 3, v: "TGL", s: "head" }];
  EBM_FORMAT.columns.forEach((c, i) => cells.push({ r: 4, c: 4 + i, v: c.label, s: "head" }));
  cells.push({ r: 5, c: 3, v: 3, s: "center" }, { r: 5, c: 4, v: "Ko Yosi", s: "cell" }, { r: 5, c: 5, v: "Ce & <Ivon>", s: "cell" });
  const buf = buildXlsx([{ name: "Jadwal", cells, merges: ["C3:J3"], cols: [3, 3, 8] }, { name: "Daftar", cells: [{ r: 1, c: 1, v: "Ko Yosi" }] }]);
  const r = parseTeamSheet(readXlsx(buf), EBM_FORMAT, 2027);
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0]!.names.pic, "Ko Yosi");
  assert.equal(r.rows[0]!.names.cameramen, "Ce"); // dua nama di satu sel: ambil yang pertama
  assert.ok(r.warnings.some((w) => /lebih dari satu nama/.test(w.message)));
});

test("sel berisi dua nama memberi peringatan dan memakai nama pertama", () => {
  const cells: XCell[] = [{ r: 1, c: 3, v: "MARET" }, { r: 2, c: 3, v: "TGL" }, { r: 2, c: 4, v: "PIC" }, { r: 3, c: 3, v: 7 }, { r: 3, c: 4, v: "Albert / Sari" }];
  const r = parseTeamSheet(readXlsx(buildXlsx([{ name: "x", cells }])), EBM_FORMAT, 2027);
  assert.equal(r.rows[0]!.names.pic, "Albert");
  assert.equal(r.warnings.length >= 1, true);
});

const P = (id: string, name: string, nickname: string | null = null, aliases: string[] = [], isMember = true): Candidate => ({ id, name, nickname, aliases, nameKey: name.toLowerCase(), isMember });

test("pencocokan nama: persis, panggilan, alias, dan saran", () => {
  const people = [P("1", "Yosi Hartono", "Ko Yosi"), P("2", "Yudhistira Wijaya", null, ["yudhis"]), P("3", "Vincent Tan"), P("4", "Vincentius Lim", null, [], false), P("5", "Yosua Putra")];
  assert.equal(matchName("KO YOSI", people).personId, "1"); // nama panggilan
  assert.equal(matchName("YUDHIS", people).personId, "2"); // alias tersimpan
  assert.equal(matchName("Vincent Tan", people).personId, "3");
  const y = matchName("YOSI", people);
  assert.equal(y.status, "AMBIGUOUS"); // tidak otomatis: "Yosi" bukan persis
  assert.equal(y.guess, "1");
  assert.ok(y.suggestions.includes("1"));
  const v = matchName("VINCENT", people);
  assert.equal(v.status, "AMBIGUOUS");
  assert.equal(v.suggestions[0], "3"); // anggota EBM didahulukan
  assert.equal(matchName("ZZZ", people).status, "NONE");
});

test("catatan teks di bawah blok bulan diabaikan, bukan dianggap tanggal", () => {
  const cells: XCell[] = [
    { r: 1, c: 3, v: "MARET" }, { r: 2, c: 3, v: "TGL" }, { r: 2, c: 4, v: "PIC" }, { r: 3, c: 3, v: 7 }, { r: 3, c: 4, v: "Albert" },
    { r: 6, c: 3, v: "Isi nama persis seperti di daftar pilihan. Satu baris berlaku untuk Ibadah Minggu I dan II." },
  ];
  const r = parseTeamSheet(readXlsx(buildXlsx([{ name: "x", cells }])), EBM_FORMAT, 2027);
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows.length, 1);
});

test("teks di kolom TGL yang disertai nama tetap dilaporkan sebagai galat", () => {
  const cells: XCell[] = [{ r: 1, c: 3, v: "MARET" }, { r: 2, c: 3, v: "TGL" }, { r: 2, c: 4, v: "PIC" }, { r: 3, c: 3, v: "minggu depan" }, { r: 3, c: 4, v: "Albert" }];
  const r = parseTeamSheet(readXlsx(buildXlsx([{ name: "x", cells }])), EBM_FORMAT, 2027);
  assert.equal(r.errors.length, 1);
});

test("kolom pelayanan yang belum dikenal ditawarkan sebagai pelayanan baru", () => {
  const cells: XCell[] = [
    { r: 1, c: 3, v: "FEBRUARI" }, { r: 2, c: 3, v: "TGL" }, { r: 2, c: 4, v: "PIC" }, { r: 2, c: 5, v: "SPONSOR" }, { r: 2, c: 6, v: "KET" },
    { r: 3, c: 3, v: 7 }, { r: 3, c: 4, v: "Albert" }, { r: 3, c: 5, v: "Patrick" }, { r: 3, c: 6, v: "libur" },
  ];
  const r = parseTeamSheet(readXlsx(buildXlsx([{ name: "x", cells }])), EBM_FORMAT, 2027);
  assert.deepEqual(r.errors, []);
  assert.equal(r.extraColumns.length, 1); // KET hanya catatan, bukan pelayanan
  assert.deepEqual(r.extraColumns[0], { key: "x_SPONSOR", label: "SPONSOR", suggested: "Sponsor" });
  assert.equal(r.rows[0]!.names.x_SPONSOR, "Patrick");
  assert.equal(r.rows[0]!.names.pic, "Albert");
  assert.ok(r.warnings.some((w) => /KET/.test(w.message)));
});

test("nama saran pelayanan: huruf besar semua jadi kapital di awal kata, singkatan pendek tetap", () => {
  assert.equal(suggestMinistryName("SPONSOR"), "Sponsor");
  assert.equal(suggestMinistryName("EASY WORSHIP"), "Easy Worship");
  assert.equal(suggestMinistryName("LED"), "LED");
  assert.equal(suggestMinistryName("Backup Cam"), "Backup Cam");
});
