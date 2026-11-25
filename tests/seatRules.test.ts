import { test } from "node:test";
import assert from "node:assert/strict";
import { ebmOutsideWarning, isSundayPair, judgePair, needsEbmGroupPrompt, seatKind, teamKind } from "../src/lib/seatRules";

const seat = (teamName: string, ministryName: string) => ({ teamName, ministryName });
const PIC = seat("Pimpinan ibadah", "PIC");
const LITURGOS = seat("Pimpinan ibadah", "Liturgos (WL)");
const USHER = seat("Usher", "Usher");
const KEYS = seat("Tim pemusik", "Keyboard");
const LCD = seat("Tim EBM", "LCD");
const SOUND = seat("Tim EBM", "Sound");

test("jenis tim dikenali dari namanya", () => {
  assert.equal(teamKind("Tim EBM"), "EBM");
  assert.equal(teamKind("Usher"), "USHER");
  assert.equal(teamKind("Tim pemusik"), "PEMUSIK");
  assert.equal(teamKind("Pimpinan ibadah"), "PIMPINAN");
  assert.equal(teamKind("Tim publikasi"), "OTHER");
});

test("PIC boleh merangkap Usher, dari dua arah, dengan catatan", () => {
  const a = judgePair(USHER, PIC, "Budi");
  const b = judgePair(PIC, USHER, "Budi");
  assert.equal(a.kind, "ALLOWED");
  assert.equal(b.kind, "ALLOWED");
  assert.match((a as { note: string }).note, /Budi merangkap PIC dan Usher/);
});

test("Liturgos atau pemusik tidak ikut kelonggaran PIC", () => {
  assert.equal(judgePair(USHER, LITURGOS, "Budi").kind, "CONFLICT");
  assert.equal(judgePair(PIC, KEYS, "Budi").kind, "CONFLICT");
});

test("orang EBM tidak boleh merangkap Usher atau pemusik, dari dua arah", () => {
  const a = judgePair(USHER, LCD, "Sari");
  const b = judgePair(KEYS, SOUND, "Sari");
  const c = judgePair(LCD, USHER, "Sari");
  const d = judgePair(SOUND, KEYS, "Sari");
  for (const v of [a, b, c, d]) assert.equal(v.kind, "BLOCKED");
  assert.match((a as { message: string }).message, /sudah bertugas di EBM \(LCD\)/);
  assert.match((c as { message: string }).message, /sudah bertugas sebagai Usher/);
});

test("sesama posisi EBM boleh dirangkap satu orang, dengan catatan", () => {
  const v = judgePair(LCD, SOUND, "Sari");
  assert.equal(v.kind, "ALLOWED");
  assert.match((v as { note: string }).note, /Sari merangkap Sound dan LCD/);
  assert.equal(judgePair(seat("Tim EBM", "PIC EBM"), LCD, "Sari").kind, "ALLOWED");
});

test("pasangan lain tetap bentrok biasa (bisa ditembus Superadmin)", () => {
  assert.equal(judgePair(LCD, PIC, "Sari").kind, "CONFLICT");
});

const other = (personId: string, name: string, ministryName: string, teamName: string) => ({ personId, name, ministryName, teamName });

test("peringatan hanya bila sudah ada anggota EBM lain di luar EBM pada acara itu", () => {
  const base = { personId: "p1", personIsEbm: true, seatTeamName: "Usher" };
  assert.equal(ebmOutsideWarning({ ...base, others: [] }), null);
  const w = ebmOutsideWarning({ ...base, others: [other("p2", "Andi", "Keyboard", "Tim pemusik")] });
  assert.match(w ?? "", /Andi \(Keyboard\)/);
  assert.match(w ?? "", /hanya 1 anggota EBM/);
});

test("bukan anggota EBM, atau kursi di EBM sendiri, atau orang yang sama: tanpa peringatan", () => {
  const rest = [other("p2", "Andi", "Keyboard", "Tim pemusik")];
  assert.equal(ebmOutsideWarning({ personId: "p1", personIsEbm: false, seatTeamName: "Usher", others: rest }), null);
  assert.equal(ebmOutsideWarning({ personId: "p1", personIsEbm: true, seatTeamName: "Tim EBM", others: rest }), null);
  assert.equal(ebmOutsideWarning({ personId: "p1", personIsEbm: true, seatTeamName: "Usher", others: [other("p1", "Diri", "PIC", "Pimpinan ibadah")] }), null);
});

test("beberapa kursi satu orang EBM dihitung satu nama", () => {
  const w = ebmOutsideWarning({
    personId: "p1", personIsEbm: true, seatTeamName: "Tim pemusik",
    others: [other("p2", "Andi", "Usher", "Usher"), other("p2", "Andi", "PIC", "Pimpinan ibadah")],
  });
  assert.equal((w ?? "").match(/Andi/g)?.length, 1);
});

test("Ibadah Minggu 1 dan 2 berpasangan, dengan angka Romawi atau Arab", () => {
  assert.ok(isSundayPair("Ibadah Minggu I", "Ibadah Minggu II"));
  assert.ok(isSundayPair("Ibadah Minggu 2", "ibadah minggu 1"));
  assert.ok(isSundayPair("Ibadah Minggu I", "Ibadah Minggu 2"));
  assert.ok(!isSundayPair("Ibadah Minggu I", "Ibadah Minggu I"));
  assert.ok(!isSundayPair("Ibadah Mandarin", "Ibadah Minggu I"));
  assert.ok(!isSundayPair("Fellowship Pemuda", "Ibadah Minggu II"));
});

// ───────── Penatalayan ibadah (gabungan pimpinan ibadah dan pemusik) ─────────

const PEN = "Penatalayan ibadah";

test("Penatalayan ibadah dikenali, nama lama tetap dikenali", () => {
  assert.equal(teamKind(PEN), "PIMPINAN");
  assert.equal(teamKind("Pimpinan ibadah"), "PIMPINAN");
  assert.equal(teamKind("Tim pemusik"), "PEMUSIK");
});

test("kursi di Penatalayan: PIC, Liturgos, Pembicara = pimpinan; alat musik dan Singer = pemusik", () => {
  for (const m of ["PIC", "Liturgos (WL)", "Pembicara"]) assert.equal(seatKind(PEN, m), "PIMPINAN");
  for (const m of ["Keyboard", "Piano", "PSR", "Bass", "Gitar", "Gitar 2", "Kajon", "Drum", "Singer"]) assert.equal(seatKind(PEN, m), "PEMUSIK");
  assert.equal(seatKind("Tim EBM", "LCD"), "EBM");
  assert.equal(seatKind("Usher", "Usher"), "USHER");
});

test("setelah digabung: EBM tetap tidak boleh merangkap pemusik, PIC tetap boleh merangkap Usher", () => {
  const keys = seat(PEN, "Keyboard");
  const singer = seat(PEN, "Singer");
  assert.equal(judgePair(keys, LCD, "Sari").kind, "BLOCKED");
  assert.equal(judgePair(LCD, singer, "Sari").kind, "BLOCKED");
  assert.equal(judgePair(USHER, seat(PEN, "PIC"), "Budi").kind, "ALLOWED");
  assert.equal(judgePair(USHER, seat(PEN, "Liturgos (WL)"), "Budi").kind, "CONFLICT");
  assert.equal(judgePair(USHER, keys, "Budi").kind, "CONFLICT");
  // pemusik merangkap posisi lain di Penatalayan: bentrok biasa
  assert.equal(judgePair(keys, seat(PEN, "PIC"), "Budi").kind, "CONFLICT");
});

test("konfirmasi masuk kelompok EBM hanya untuk orang yang pertama kali melayani di EBM dan belum anggota", () => {
  assert.equal(needsEbmGroupPrompt({ addsEbm: true, hasEbmNow: false, activeMember: false }), true);
  assert.equal(needsEbmGroupPrompt({ addsEbm: true, hasEbmNow: true, activeMember: false }), false); // sudah punya pelayanan EBM
  assert.equal(needsEbmGroupPrompt({ addsEbm: true, hasEbmNow: false, activeMember: true }), false); // sudah anggota kelompok
  assert.equal(needsEbmGroupPrompt({ addsEbm: false, hasEbmNow: false, activeMember: false }), false); // yang ditambah bukan pelayanan EBM
});
