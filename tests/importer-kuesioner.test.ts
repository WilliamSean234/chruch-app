import { test } from "node:test";
import assert from "node:assert/strict";
import { convertKuesioner, isKuesioner } from "../src/lib/importer/kuesioner";
import type { XSheet } from "../src/lib/importer/xlsx";

/** Bangun sheet dari baris: tiap baris = daftar teks mulai kolom A. */
function sheet(name: string, lines: Record<number, (string | undefined)[]>): XSheet {
  const cells = new Map<number, Map<number, string>>();
  let maxRow = 0;
  for (const [r, vals] of Object.entries(lines)) {
    const row = new Map<number, string>();
    vals.forEach((v, i) => { if (v) row.set(i + 1, v); });
    cells.set(+r, row);
    maxRow = Math.max(maxRow, +r);
  }
  return { name, maxRow, cells };
}

const orang = sheet("1 Orang", {
  4: ["No", "Gelar", "Nama lengkap *", "Nama panggilan", "JK", "Tanggal lahir", "No HP / WhatsApp", "Email", "Kelompok CG", "Komunitas", "Status di gereja"],
  5: ["Contoh", undefined, "Contoh Orang", undefined, "L"],
  6: ["1", "Pdt.", "Lukas Hartono", undefined, "L", "1975-09-09", undefined, undefined, undefined, undefined, "Pendeta / Hamba Tuhan"],
  7: ["2", undefined, "Michael Tanoto", "Mike", "L", undefined, "0812", "m@x.id", "CG Gubeng"],
});
const ebm = sheet("3A Anggota EBM", {
  3: ["Koordinator tim:", undefined, "Michael Tanoto"],
  4: ["No", "Nama", "Masih aktif melayani?", "PIC EBM", "Cameramen", "Posisi lain 1\n(tulis nama posisi)", "Catatan"],
  5: ["Contoh", "Setia Budi", "Ya", "v"],
  6: ["1", "Michael Tanoto", "Ya", "v", undefined, "Operator Kamera"],
  7: ["2", "Dewi Baru", "Ya", undefined, "v"],
  8: ["3", "Yosua", "Berhenti", "v"],
});
const tim = sheet("2 Tim & Posisi", {
  4: ["No", "Tim", "Posisi / jabatan", "Tugas singkat", "Jumlah orang per ibadah", "Wajib latihan?", "Cek", "Koreksi / catatan"],
  6: ["1", "Tim EBM", "PIC EBM", undefined, "1", "Ya", "Benar"],
  7: ["2", "Tim EBM", "Cameramen", undefined, "1", "Tidak", "Hapus"],
});
const jab = sheet("5B Jabatan Kelompok", {
  4: ["No", "Kelompok", "Jabatan", "Jumlah orang di jabatan ini", "Boleh menjadwalkan rapat & pinjam ruangan?", "Boleh menulis notulen?", "Boleh memfinalkan notulen?", "Boleh mengatur anggota kelompok?"],
  6: ["1", "Majelis", "Ketua", "1", "Tidak", "Tidak", "Ya", "Ya"],
  7: ["2", "Majelis", "Penatua", "5"],
  8: ["3", "Majelis", "Seksi umum"], // jumlah kosong = tanpa batas
  9: ["4", "Majelis"], // kelompok tanpa jabatan: dilewati
});
const akun = sheet("4 Penjadwal & Admin", {
  5: ["", "Peran", "Apa yang boleh dilakukan"],
  12: ["No", "Nama", "Peran", "Tim yang dikelola", "Email untuk masuk aplikasi"],
  14: ["1", "Michael Tanoto", "Admin Tim", "Tim EBM", "m@gereja.id"],
  15: ["2", "Setia Budi", "Pelayan (hanya lihat jadwal)"],
});
const all = [orang, tim, ebm, jab, akun];
const vals = (rows: { v: Record<string, string> }[], ...ids: string[]) => rows.map((r) => ids.map((i) => r.v[i]));

test("kuesioner dikenali dari nama tab-nya, template impor tidak", () => {
  assert.equal(isKuesioner(all), true);
  assert.equal(isKuesioner([sheet("Orang", {}), sheet("Pelayanan", {})]), false);
});

test("orang: status Pendeta/Hamba Tuhan jadi Pendeta, kosong jadi Jemaat, pelayanan dari tab 3, baris Contoh dilewati", () => {
  const { rows } = convertKuesioner(all);
  assert.deepEqual(vals(rows.Orang.filter((r) => !r.v.addOnly), "name", "position", "ministries"), [
    ["Lukas Hartono", "Pendeta", ""],
    ["Michael Tanoto", "Jemaat", "PIC EBM, Operator Kamera"],
  ]);
  assert.equal(rows.Orang[0]!.v.birth, "1975-09-09");
  assert.equal(rows.Orang[1]!.v.nickname, "Mike");
});

test("orang yang hanya ada di tab 3 jadi baris hanya-pelayanan; yang Berhenti tidak diimpor", () => {
  const { rows, notes } = convertKuesioner(all);
  const only = rows.Orang.filter((r) => r.v.addOnly);
  assert.deepEqual(vals(only, "name", "ministries"), [["Dewi Baru", "Cameramen"]]);
  assert.ok(notes.some((n) => /Yosua.*Berhenti/.test(n)));
});

test("posisi lain di tab 3 jadi pelayanan baru di tim tab itu, tanpa kembar dengan tab 2", () => {
  const { rows } = convertKuesioner(all);
  const names = rows.Pelayanan.map((r) => `${r.v.team}|${r.v.name}`);
  assert.deepEqual(names, ["Tim EBM|PIC EBM", "Tim EBM|Cameramen", "Tim EBM|Operator Kamera"]);
  assert.equal(rows.Pelayanan[0]!.v.rehearsal, "Ya"); // isian Wajib latihan dari tab 2 terbawa
});

test("jabatan: jumlah orang kosong = tanpa batas, kelompok tanpa jabatan dilewati", () => {
  const { rows } = convertKuesioner(all);
  assert.deepEqual(vals(rows.JabatanKelompok, "name", "seats"), [["Ketua", "1"], ["Penatua", "5"], ["Seksi umum", "tanpa batas"]]);
});

test("akun: tanpa email tidak dibuat tapi dicatat; peran Pelayan dinormalkan", () => {
  const { rows, notes } = convertKuesioner(all);
  assert.deepEqual(vals(rows.Akun, "person", "email", "role", "team"), [["Michael Tanoto", "m@gereja.id", "Admin Tim", "Tim EBM"]]);
  assert.ok(notes.some((n) => /Setia Budi.*email/.test(n)));
});

test("pelayanan bertanda Hapus tidak dihapus tapi dicatat; koordinator dicatat", () => {
  const { notes } = convertKuesioner(all);
  assert.ok(notes.some((n) => /Cameramen.*Hapus/.test(n)));
  assert.ok(notes.some((n) => /Koordinator Tim EBM: Michael Tanoto/.test(n)));
});
