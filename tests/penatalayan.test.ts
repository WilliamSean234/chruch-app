import { test } from "node:test";
import assert from "node:assert/strict";
import { readXlsx, type XSheet } from "@/lib/importer/xlsx";
import { buildXlsx } from "@/lib/xlsxWrite";
import { PENATALAYAN_FORMAT, cleanPenName, parseBand, parsePenSheet, penColumns, penLayout, penSheet, withPenSlots } from "@/lib/penatalayan";
import { parseFullDate } from "@/lib/teamFormats";

const grid = (rows: Record<number, Record<number, string>>): XSheet => ({
  name: "Jadwal", maxRow: 99,
  cells: new Map(Object.entries(rows).map(([r, cs]) => [Number(r), new Map(Object.entries(cs).map(([c, v]) => [Number(c), v]))])),
});

test("tanggal dengan tahun 2 angka", () => {
  assert.deepEqual(parseFullDate("4-Oct-26"), { y: 2026, m: 10, d: 4 });
  assert.deepEqual(parseFullDate("Minggu, 3 Jan 27"), { y: 2027, m: 1, d: 3 });
  assert.deepEqual(parseFullDate("3 Jan 2027"), { y: 2027, m: 1, d: 3 });
});

test("bersihkan isi sel: kurung, ganti, banyak nama, kosong", () => {
  assert.deepEqual(cleanPenName("Kevin (B)"), { name: "Kevin", others: [], notes: ["B"] });
  assert.equal(cleanPenName("Albert (Cajoon)").name, "Albert");
  assert.equal(cleanPenName("Catherine ganti Richard").name, "Catherine");
  const two = cleanPenName("Kevin (B) Immanuel (G)");
  assert.equal(two.name, "Kevin"); assert.deepEqual(two.others, ["Immanuel"]);
  const amp = cleanPenName("Kevin & Welly (G)");
  assert.equal(amp.name, "Kevin"); assert.deepEqual(amp.others, ["Welly"]);
  assert.equal(cleanPenName("Mikha, Eva").others[0], "Eva");
  assert.equal(cleanPenName("Ev. Ivan (propose tukar dengan Suliva)").name, "Ev. Ivan");
  assert.equal(cleanPenName("TBC").name, "");
  assert.equal(cleanPenName("  -  ").name, "");
  assert.equal(cleanPenName("").name, "");
});

test("Band / No Band", () => {
  assert.equal(parseBand("Band"), "BAND");
  assert.equal(parseBand("No Band"), "NO_BAND");
  assert.equal(parseBand("NO BAND"), "NO_BAND");
  assert.equal(parseBand("Band(KKR)"), "BAND");
  assert.equal(parseBand(""), null);
  assert.equal(parseBand("Akustik"), undefined);
});

test("kolom dinamis: Gitar 2 dan Singer 3", () => {
  const cols = penColumns({ lit: 1, keyboard: 1, gitar: 2, singer: 3, pic: 1 });
  assert.deepEqual(cols.map((c) => c.key), ["lit", "keyboard", "gitar", "gitar_2", "singer", "singer_2", "singer_3", "pic"]);
  assert.equal(cols.find((c) => c.key === "gitar_2")!.slotNo, 2);
  assert.equal(cols.find((c) => c.key === "gitar")!.label, "Gitar 1");
  assert.equal(penColumns({ keyboard: 1 })[0]!.label, "Keyboard");
  assert.equal(withPenSlots(PENATALAYAN_FORMAT, { pic: 1 }).columns.length, 1);
});

const COUNTS = { lit: 1, keyboard: 1, piano: 1, bass: 1, gitar: 2, drum: 1, singer: 2, pic: 1 };
const THEME = "Eksposisi Lukas 16:19-31\n\nThe Mirage of Wealth";

function sheetFor(rows: { day: number; cells: Record<string, string> }[], extras: { key: string; label: string }[] = []) {
  const { columns, groups } = penLayout(penColumns(COUNTS), extras);
  const spec = penSheet({ title: "JADWAL PENATALAYAN IBADAH", year: 2026, columns, groups, months: [{ name: "OKTOBER", rows }] }, { name: "Jadwal" });
  return { columns, groups, sheets: readXlsx(buildXlsx([spec])) };
}

test("tata letak: Liturgos, Pemusik (Band/No Band lebih dulu), Backing Vocal, PIC, Padus, Tema", () => {
  const { columns, groups } = penLayout(penColumns(COUNTS), [{ key: "x_KAJON", label: "Kajon" }]);
  assert.deepEqual(groups.map((g) => g.label), ["Liturgos", "Pemusik", "Backing Vocal", "PIC", "Padus", "Tema"]);
  assert.deepEqual(groups[1]!.keys, ["@band", "keyboard", "piano", "bass", "gitar", "gitar_2", "drum", "x_KAJON"]);
  assert.ok(groups[0]!.single && groups[3]!.single && !groups[1]!.single);
  assert.equal(columns[0]!.key, "lit");
  assert.equal(columns.at(-1)!.key, "@theme");
});

test("export/template ditulis lalu dibaca kembali tanpa perubahan", () => {
  const { sheets } = sheetFor([
    { day: 4, cells: { lit: "Suliva", "@band": "Band", keyboard: "Catherine", piano: "", bass: "Kevin", gitar: "Imam", gitar_2: "Welly", drum: "Kiki", x_KAJON: "Albert", singer: "Felice", singer_2: "Patrick", pic: "Kevin", "@padus": "Choir Dewasa - KU 1 & 2", "@theme": THEME } },
    { day: 11, cells: { lit: "Ev. Joy", "@band": "No Band", keyboard: "Raynald", piano: "Stefanita", bass: "", gitar: "", gitar_2: "", drum: "", x_KAJON: "", singer: "Leo", singer_2: "Sheryn", pic: "Nita", "@padus": "", "@theme": "Pelayanan" } },
  ], [{ key: "x_KAJON", label: "Kajon" }]);
  const r = parsePenSheet(sheets, PENATALAYAN_FORMAT, 2026);
  assert.deepEqual(r.errors, []);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.penSlots, COUNTS);
  assert.deepEqual(r.extraColumns.map((x) => [x.key, x.suggested]), [["x_KAJON", "Kajon"]]);
  const a = r.rows[0]!;
  assert.equal(a.date, "2026-10-04");
  assert.equal(a.names.lit, "Suliva"); assert.equal(a.names.gitar, "Imam"); assert.equal(a.names.gitar_2, "Welly"); assert.equal(a.names.x_KAJON, "Albert");
  assert.equal(a.names.singer_2, "Patrick"); assert.equal(a.names.pic, "Kevin");
  assert.deepEqual(a.attrs, { band: "BAND", padus: "Choir Dewasa - KU 1 & 2", theme: THEME });
  const b = r.rows[1]!;
  assert.equal(b.date, "2026-10-11");
  assert.equal(b.attrs!.band, "NO_BAND"); assert.equal(b.attrs!.padus, ""); assert.equal(b.attrs!.theme, "Pelayanan");
  assert.equal(b.names.piano, "Stefanita");
});

test("No Band: isian di kolom bass/gitar/drum diabaikan dengan catatan", () => {
  const { sheets } = sheetFor([{ day: 4, cells: { lit: "A", "@band": "No Band", keyboard: "B", bass: "Kevin", gitar: "Imam", drum: "Kiki", singer: "C", pic: "D" } }]);
  const r = parsePenSheet(sheets, PENATALAYAN_FORMAT, 2026);
  assert.equal(r.rows[0]!.names.bass, ""); assert.equal(r.rows[0]!.names.gitar, ""); assert.equal(r.rows[0]!.names.drum, "");
  assert.equal(r.rows[0]!.names.keyboard, "B");
  assert.ok(r.warnings.some((w) => /No Band/.test(w.message) && /Kevin/.test(w.message)));
});

test("catatan di sel dan tanggal tidak merusak pembacaan; banyak nama diberi peringatan", () => {
  const { sheets } = sheetFor([
    { day: 4, cells: { lit: "Mikha, Eva", "@band": "Band(KKR)", keyboard: "Catherine ganti Richard", bass: "Kevin (B)", gitar: "Kevin & Welly (G)", drum: "Albert (Cajoon)", singer: "TBC", pic: "Panitia" } },
  ]);
  const r = parsePenSheet(sheets, PENATALAYAN_FORMAT, 2026);
  assert.deepEqual(r.errors, []);
  const n = r.rows[0]!.names;
  assert.equal(n.lit, "Mikha"); assert.equal(n.keyboard, "Catherine"); assert.equal(n.bass, "Kevin"); assert.equal(n.gitar, "Kevin"); assert.equal(n.drum, "Albert"); assert.equal(n.singer, "");
  assert.equal(r.rows[0]!.attrs!.band, "BAND");
  assert.ok(r.warnings.some((w) => /lebih dari satu nama/.test(w.message) && /Gitar 2/.test(w.message)));
  assert.ok(r.warnings.some((w) => /dalam kurung/.test(w.message)));
});

test("kolom yang tidak ada di file tidak diubah: atribut dan kursi", () => {
  // hanya Tanggal, Liturgos, PIC (tanpa Band/Padus/Tema)
  const sheet = grid({
    1: { 3: "OKTOBER" },
    2: { 3: "TGL", 4: "Liturgos", 5: "PIC" },
    3: { 3: "4", 4: "Suliva", 5: "Kevin" },
  });
  const r = parsePenSheet([sheet], PENATALAYAN_FORMAT, 2026);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.penSlots, { lit: 1, pic: 1 });
  assert.equal(r.rows[0]!.attrs!.band, undefined); assert.equal(r.rows[0]!.attrs!.theme, undefined); assert.equal(r.rows[0]!.attrs!.padus, undefined);
});

test("file lama: tanggal d-Mon-yy, kolom Pemusik tanpa judul kolom ditolak dengan petunjuk", () => {
  const sheet = grid({
    1: { 1: "Tanggal", 2: "Liturgos", 3: "Pemusik", 8: "Backing Vocal", 10: "PIC", 11: "Padus", 12: "Tema" },
    2: { 1: "4-Oct-26", 2: "Suliva", 3: "Band", 4: "Catherine", 6: "Kevin (B)", 7: "Kiki", 8: "Felice", 9: "Patrick", 10: "Kevin", 11: "Choir", 12: "Tema" },
  });
  sheet.merges = [{ r1: 1, c1: 3, r2: 1, c2: 7 }, { r1: 1, c1: 8, r2: 1, c2: 9 }];
  const r = parsePenSheet([sheet], PENATALAYAN_FORMAT, 2026);
  assert.ok(r.errors.some((e) => /belum diberi nama/.test(e.message)));
});

test("tanpa judul bulan: tanggal lengkap d-Mon-yy, catatan di tanggal, kelompok bernama tanpa judul kolom", () => {
  const sheet = grid({
    1: { 1: "Tanggal", 2: "Liturgos", 3: "Backing Vocal", 5: "PIC" },
    2: { 1: "4-Oct-26", 2: "Suliva", 3: "Felice", 4: "Patrick", 5: "Kevin" },
    3: { 1: "11-Oct-26 (KKR)", 2: "Ev. Joy", 3: "Leo", 4: "Sheryn", 5: "Nita" },
  });
  sheet.merges = [{ r1: 1, c1: 3, r2: 1, c2: 4 }];
  const r = parsePenSheet([sheet], PENATALAYAN_FORMAT, 2026);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-10-04", "2026-10-11"]);
  assert.equal(r.rows[0]!.names.singer, "Felice"); assert.equal(r.rows[0]!.names.singer_2, "Patrick");
  assert.deepEqual(r.penSlots, { lit: 1, singer: 2, pic: 1 });
});

test("beberapa sheet (satu per bulan) digabung", () => {
  const a = grid({ 1: { 3: "OKTOBER" }, 2: { 3: "TGL", 4: "Liturgos" }, 3: { 3: "4", 4: "A" } });
  const b = grid({ 1: { 3: "NOVEMBER" }, 2: { 3: "TGL", 4: "Liturgos" }, 3: { 3: "1", 4: "B" } });
  const r = parsePenSheet([a, b], PENATALAYAN_FORMAT, 2026);
  assert.deepEqual(r.rows.map((x) => x.date), ["2026-10-04", "2026-11-01"]);
});

test("salah tahun dan bukan hari Minggu dilaporkan", () => {
  const sheet = grid({ 1: { 3: "OKTOBER" }, 2: { 3: "TGL", 4: "Liturgos" }, 3: { 3: "5", 4: "A" }, 4: { 3: "2026-10-18", 4: "B" }, 5: { 3: "2025-10-19", 4: "C" } });
  const r = parsePenSheet([sheet], PENATALAYAN_FORMAT, 2026);
  assert.equal(r.rows.length, 1);
  assert.equal(r.errors.length, 2);
});
