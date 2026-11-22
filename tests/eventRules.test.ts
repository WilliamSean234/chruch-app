import { test } from "node:test";
import assert from "node:assert/strict";
import { checkEvent, overlappingBookings, type RuleContext, type RuleEvent, type RuleSeat } from "../src/lib/eventRules";

const seat = (personId: string | null, team: string, ministry: string, extra: Partial<RuleSeat> = {}): RuleSeat => ({
  personId, personName: personId ? personId.toUpperCase() : null, ministryId: `m-${ministry}`, ministryName: ministry, teamTypeId: `t-${team}`, teamName: team, bandOnly: false, ...extra,
});
const ctx = (ebm: string[], capableAll = true, seats: RuleSeat[] = []): RuleContext => ({
  ebm: new Set(ebm),
  capable: new Set(capableAll ? seats.filter((s) => s.personId).map((s) => `${s.personId}:${s.ministryId}`) : []),
});
const run = (seats: RuleSeat[], ebm: string[], bandMode: RuleEvent["bandMode"] = "BAND", capableAll = true) => checkEvent({ bandMode, seats }, ctx(ebm, capableAll, seats));
const codes = (v: { code: string }[]) => v.map((x) => x.code);

test("satu anggota EBM di Penatalayan ibadah: boleh", () => {
  const seats = [seat("a", "Penatalayan ibadah", "Liturgos"), seat("b", "Penatalayan ibadah", "Keyboard")];
  assert.deepEqual(codes(run(seats, ["a"])), []);
});

test("dua anggota EBM di Penatalayan ibadah: melanggar", () => {
  const seats = [seat("a", "Penatalayan ibadah", "Liturgos"), seat("b", "Penatalayan ibadah", "Keyboard")];
  const r = run(seats, ["a", "b"]);
  assert.deepEqual(codes(r), ["EBM_LUAR"]);
  assert.match(r[0]!.message, /2 anggota EBM/);
});

test("anggota EBM di EBM dan satu lagi di Usher: tidak dihitung melanggar", () => {
  const seats = [seat("a", "Tim EBM", "LCD"), seat("b", "Usher", "Usher")];
  assert.deepEqual(codes(run(seats, ["a", "b"])), []);
});

test("orang yang sama di EBM dan Usher: merangkap dilarang", () => {
  const seats = [seat("a", "Tim EBM", "LCD"), seat("a", "Usher", "Usher")];
  assert.deepEqual(codes(run(seats, ["a"])), ["EBM_RANGKAP"]);
});

test("PIC merangkap Usher dan EBM merangkap EBM: dibolehkan", () => {
  const seats = [seat("a", "Penatalayan ibadah", "PIC"), seat("a", "Usher", "Usher"), seat("b", "Tim EBM", "LCD"), seat("b", "Tim EBM", "Sound")];
  assert.deepEqual(codes(run(seats, ["b"])), []);
});

test("kursi EBM diisi orang di luar EBM", () => {
  assert.deepEqual(codes(run([seat("x", "Tim EBM", "LCD")], [])), ["KURSI_EBM"]);
});

test("No Band dengan posisi band berorang", () => {
  const seats = [seat("a", "Penatalayan ibadah", "Drum", { bandOnly: true })];
  assert.deepEqual(codes(run(seats, [], "NO_BAND")), ["NO_BAND"]);
  assert.deepEqual(codes(run(seats, [], "BAND")), []);
});

test("orang belum tercatat bisa posisinya: peringatan", () => {
  const r = run([seat("a", "Usher", "Usher")], [], "BAND", false);
  assert.deepEqual(codes(r), ["BELUM_BISA"]);
  assert.equal(r[0]!.severity, "PERINGATAN");
});

test("kursi kosong tidak diperiksa", () => {
  assert.deepEqual(codes(run([seat(null, "Tim EBM", "LCD")], [])), []);
});

const t = (h: number) => new Date(Date.UTC(2026, 0, 4, h));
test("pemakaian waktu bertumpuk di acara berbeda terdeteksi", () => {
  const pairs = overlappingBookings([
    { id: "1", personId: "a", startsAt: t(1), endsAt: t(3), kind: "EVENT", eventId: "e1" },
    { id: "2", personId: "a", startsAt: t(2), endsAt: t(4), kind: "EVENT", eventId: "e2" },
    { id: "3", personId: "a", startsAt: t(5), endsAt: t(6), kind: "EVENT", eventId: "e3" },
  ]);
  assert.equal(pairs.length, 1);
});

test("acara yang sama dan latihan kembar tidak dihitung bentrok", () => {
  const pairs = overlappingBookings([
    { id: "1", personId: "a", startsAt: t(1), endsAt: t(3), kind: "EVENT", eventId: "e1" },
    { id: "2", personId: "a", startsAt: t(1), endsAt: t(3), kind: "EVENT", eventId: "e1" },
    { id: "3", personId: "b", startsAt: t(1), endsAt: t(2), kind: "REHEARSAL", eventId: "e1" },
    { id: "4", personId: "b", startsAt: t(1), endsAt: t(2), kind: "REHEARSAL", eventId: "e2" },
  ]);
  assert.equal(pairs.length, 0);
});
