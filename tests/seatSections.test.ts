import { test } from "node:test";
import assert from "node:assert/strict";
import { monthHeading, seatSections, type SeatLite } from "../src/lib/seatSections";

const p = (id: string) => ({ id, name: id, origin: "DALAM", originChurch: null });
const seat = (id: string, team: string, who: string | null, rehearsal = false): SeatLite => ({ id, teamTypeId: team, label: id, ministryName: id, rehearsalRequired: rehearsal, person: who ? p(who) : null });
const teams = [{ teamTypeId: "t1", name: "Pemusik" }, { teamTypeId: "t2", name: "Singer" }, { teamTypeId: "t3", name: "Usher" }];

test("seatSections: kursi kosong dan tim tanpa orang disembunyikan", () => {
  const r = seatSections(teams, [seat("Bass", "t1", "Ani"), seat("Drum", "t1", null), seat("Singer 1", "t2", null)]);
  assert.deepEqual(r.map((x) => [x.title, x.seats.map((s) => s.id)]), [["Pemusik", ["Bass"]]]);
});

test("seatSections: mode latihan hanya yang wajib latihan", () => {
  const r = seatSections(teams, [seat("Bass", "t1", "Ani", true), seat("Gitar", "t1", "Budi", false)], true);
  assert.deepEqual(r[0].seats.map((s) => s.id), ["Bass"]);
});

test("monthHeading: bulan dan tahun huruf besar", () => {
  const M = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  assert.equal(monthHeading("2026-11-01", M), "NOVEMBER 2026");
  assert.equal(monthHeading("2027-01-15", M), "JANUARI 2027");
});
