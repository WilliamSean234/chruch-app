import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeTwinRehearsals, isTwinSlot, rehearsalLimit, rehearsalTimingError, sundayBaseTitle } from "@/lib/rehearsalRules";

const d = (s: string) => new Date(s);

test("batas latihan: awal acara, atau awal acara pasangan bila lebih pagi", () => {
  const ii = d("2026-12-20T02:30:00Z"); // 09:30 WIB
  const i = d("2026-12-20T00:30:00Z"); // 07:30 WIB
  assert.equal(rehearsalLimit(ii, null).getTime(), ii.getTime());
  assert.equal(rehearsalLimit(ii, i).getTime(), i.getTime());
  assert.equal(rehearsalLimit(i, ii).getTime(), i.getTime());
});

test("latihan harus dimulai sebelum ibadah", () => {
  const limit = d("2026-12-20T00:30:00Z");
  assert.equal(rehearsalTimingError(d("2026-12-17T12:00:00Z"), limit, "x"), null); // Kamis malam
  assert.equal(rehearsalTimingError(d("2026-12-19T12:00:00Z"), limit, "x"), null); // Sabtu malam
  assert.match(rehearsalTimingError(d("2026-12-20T12:00:00Z"), limit, "Min, 20 Des 07.30")!, /sebelum ibadah/); // Minggu malam (kasus di layar)
  assert.match(rehearsalTimingError(d("2026-12-24T12:00:00Z"), limit, "x")!, /sebelum ibadah/); // Kamis sesudahnya
  assert.notEqual(rehearsalTimingError(limit, limit, "x"), null); // tepat saat ibadah mulai juga ditolak
});

test("latihan kembar: jam dan ruangan sama", () => {
  const a = { startsAt: d("2026-12-17T12:00:00Z"), endsAt: d("2026-12-17T14:00:00Z"), roomId: "r1" };
  assert.ok(isTwinSlot(a, { ...a }));
  assert.ok(!isTwinSlot(a, { ...a, roomId: "r2" }));
  assert.ok(!isTwinSlot(a, { ...a, endsAt: d("2026-12-17T14:30:00Z") }));
});

test("judul dasar Ibadah Minggu", () => {
  assert.equal(sundayBaseTitle("Ibadah Minggu II"), "Ibadah Minggu");
  assert.equal(sundayBaseTitle("Ibadah Minggu 1"), "Ibadah Minggu");
  assert.equal(sundayBaseTitle("Ibadah Minggu - 2"), "Ibadah Minggu");
  assert.equal(sundayBaseTitle("Ibadah Pi"), "Ibadah Pi");
  assert.equal(sundayBaseTitle("I"), "I");
});

test("kalender: latihan kembar tampil sekali, tanda milik saya digabung", () => {
  const base = { startsAt: "2026-12-17T12:00:00.000Z", endsAt: "2026-12-17T14:00:00.000Z", room: { id: "r1" } };
  const out = dedupeTwinRehearsals([
    { ...base, id: "a", eventTitle: "Ibadah Minggu I", mine: false },
    { ...base, id: "b", eventTitle: "Ibadah Minggu II", mine: true },
    { ...base, id: "c", eventTitle: "Rapat", mine: false, room: { id: "r2" } },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.id, "a");
  assert.equal(out[0]!.eventTitle, "Ibadah Minggu");
  assert.equal(out[0]!.mine, true);
  assert.equal(out[1]!.eventTitle, "Rapat");
});

test("kalender: dua acara berbeda di jam dan ruangan sama tidak diubah judulnya", () => {
  const base = { startsAt: "2026-12-17T12:00:00.000Z", endsAt: "2026-12-17T14:00:00.000Z", room: { id: "r1" } };
  const out = dedupeTwinRehearsals([
    { ...base, id: "a", eventTitle: "Natal", mine: false },
    { ...base, id: "b", eventTitle: "Ibadah Minggu II", mine: false },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.eventTitle, "Natal");
});
