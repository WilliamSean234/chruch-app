import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLoad, isHeavy, loadFileName, rangeError, sortLoad, teamsText, type LoadSeat } from "../src/lib/loadStats";

const seat = (personId: string, eventId: string, at: string, team: string, ministry: string, name = personId.toUpperCase()): LoadSeat =>
  ({ personId, personName: name, eventId, at, teamTypeId: `t-${team}`, teamName: team, ministryName: ministry });

test("dua kursi di ibadah yang sama dihitung satu ibadah, kursinya tetap dihitung", () => {
  const { rows } = buildLoad([
    seat("a", "e1", "2026-12-06T02:00:00.000Z", "Musik", "Keyboard"),
    seat("a", "e1", "2026-12-06T02:00:00.000Z", "Musik", "MC"),
    seat("a", "e2", "2026-12-13T02:00:00.000Z", "Musik", "Keyboard"),
  ], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.events, 2);
  assert.equal(rows[0]!.seats, 3);
});

test("orang yang melayani di dua tim: satu baris, rincian per tim, total tidak ganda", () => {
  const { rows, summary } = buildLoad([
    seat("a", "e1", "2026-12-06T02:00:00.000Z", "Musik", "Keyboard"),
    seat("a", "e1", "2026-12-06T02:00:00.000Z", "EBM", "Pembaca"), // ibadah yang sama, tim lain
    seat("a", "e2", "2026-12-13T02:00:00.000Z", "Musik", "Keyboard"),
    seat("a", "e3", "2026-12-20T02:00:00.000Z", "Musik", "Keyboard"),
    seat("a", "e4", "2026-12-27T02:00:00.000Z", "EBM", "Pembaca"),
  ], []);
  assert.equal(rows.length, 1);
  const r = rows[0]!;
  assert.equal(r.events, 4); // e1..e4, e1 hanya satu kali
  assert.equal(r.seats, 5);
  assert.deepEqual(r.teams.map((t) => [t.team, t.events, t.seats]), [["Musik", 3, 3], ["EBM", 2, 2]]);
  assert.equal(teamsText(r.teams), "Musik 3, EBM 2");
  assert.equal(summary.serving, 1);
  assert.equal(summary.events, 4);
});

test("posisi utama = yang paling sering; sama banyak = urutan huruf; tanggal terakhir = yang terbaru", () => {
  const { rows } = buildLoad([
    seat("a", "e1", "2026-12-06T02:00:00.000Z", "Musik", "Keyboard"),
    seat("a", "e2", "2026-12-27T02:00:00.000Z", "Musik", "Gitar"),
    seat("a", "e3", "2026-12-13T02:00:00.000Z", "Musik", "Gitar"),
    seat("b", "e1", "2026-12-06T02:00:00.000Z", "Musik", "Vokal"),
    seat("b", "e2", "2026-12-27T02:00:00.000Z", "Musik", "Bass"),
  ], [], new Map(), "nama");
  const a = rows.find((r) => r.personId === "a")!;
  const b = rows.find((r) => r.personId === "b")!;
  assert.equal(a.main, "Gitar");
  assert.equal(a.last, "2026-12-27T02:00:00.000Z");
  assert.equal(b.main, "Bass"); // seri: Bass sebelum Vokal
});

test("yang belum bertugas ikut tampil; yang sudah bertugas tidak dobel", () => {
  const { rows, summary } = buildLoad(
    [seat("a", "e1", "2026-12-06T02:00:00.000Z", "Musik", "Keyboard", "Ani")],
    [{ id: "a", name: "Ani", ministries: ["Keyboard"] }, { id: "d", name: "Dedi", ministries: ["Drum", "Gitar"] }],
    new Map([["d", "2026-11-23T02:00:00.000Z"]]),
  );
  assert.equal(rows.length, 2);
  const d = rows.find((r) => r.personId === "d")!;
  assert.equal(d.events, 0);
  assert.equal(d.level, "BELUM");
  assert.equal(d.main, "Drum");
  assert.equal(d.last, "2026-11-23T02:00:00.000Z");
  assert.deepEqual(d.teams, []);
  assert.equal(summary.idle, 1);
  assert.equal(summary.serving, 1);
});

test("belum bertugas dan belum pernah bertugas: tanggal terakhir kosong, posisi kosong bila tidak punya", () => {
  const { rows } = buildLoad([], [{ id: "x", name: "Xena", ministries: [] }]);
  assert.equal(rows[0]!.last, null);
  assert.equal(rows[0]!.main, "");
});

test("rata-rata hanya dari yang bertugas, satu desimal; beban tinggi memakai aturan 3 ibadah dan 1,5 kali rata-rata", () => {
  const seats: LoadSeat[] = [];
  const add = (p: string, k: number) => { for (let i = 0; i < k; i++) seats.push(seat(p, `${p}${i}`, `2026-12-0${i + 1}T02:00:00.000Z`, "Musik", "Keyboard")); };
  add("a", 7); add("b", 2); add("c", 2); add("d", 1);
  const { rows, summary } = buildLoad(seats, [{ id: "z", name: "Zed", ministries: ["Drum"] }]);
  assert.equal(summary.serving, 4);
  assert.equal(summary.average, 3); // (7+2+2+1)/4 = 3
  assert.equal(summary.heavy, 1); // hanya a: 7 >= 3 dan 7 >= 4,5
  assert.equal(summary.idle, 1); // idle tidak ikut rata-rata
  assert.equal(summary.max, 7);
  assert.equal(rows.find((r) => r.personId === "a")!.level, "TINGGI");
  assert.equal(rows.find((r) => r.personId === "b")!.level, "WAJAR");
  assert.equal(rows.find((r) => r.personId === "z")!.level, "BELUM");
});

test("isHeavy: batas bawah 3 ibadah dan 1,5 kali rata-rata", () => {
  assert.equal(isHeavy(2, 1), false); // di bawah 3
  assert.equal(isHeavy(3, 2.1), false);
  assert.equal(isHeavy(3, 2), true); // tepat 1,5 kali rata-rata masih dihitung tinggi
  assert.equal(isHeavy(5, 4), false);
  assert.equal(isHeavy(6, 4), true);
  assert.equal(isHeavy(0, 0), false);
});

test("urutan: beban, paling sedikit, nama", () => {
  const base = [
    { personId: "1", name: "Citra", events: 2, seats: 2 }, { personId: "2", name: "Andi", events: 5, seats: 5 },
    { personId: "3", name: "Budi", events: 2, seats: 3 }, { personId: "4", name: "Dedi", events: 0, seats: 0 },
  ].map((r) => ({ ...r, main: "", teams: [], last: null, level: "WAJAR" as const }));
  assert.deepEqual(sortLoad(base, "beban").map((r) => r.name), ["Andi", "Budi", "Citra", "Dedi"]); // seri 2: kursi lebih banyak dulu
  assert.deepEqual(sortLoad(base, "sedikit").map((r) => r.name), ["Dedi", "Citra", "Budi", "Andi"]);
  assert.deepEqual(sortLoad(base, "nama").map((r) => r.name), ["Andi", "Budi", "Citra", "Dedi"]);
  assert.equal(base[0]!.name, "Citra"); // daftar asal tidak diubah
});

test("rentang tanggal: valid, terbalik, tidak ada di kalender, terlalu panjang", () => {
  assert.equal(rangeError("2026-12-01", "2026-12-31"), null);
  assert.equal(rangeError("2026-01-01", "2026-12-31"), null); // 365 hari
  assert.equal(rangeError("2024-01-01", "2024-12-31"), null); // 366 hari (kabisat)
  assert.match(rangeError("2026-12-31", "2026-12-01")!, /tidak boleh setelah/);
  assert.match(rangeError("2026-02-31", "2026-03-05")!, /tidak valid/);
  assert.match(rangeError("abc", "2026-03-05")!, /tidak valid/);
  assert.match(rangeError("2025-01-01", "2026-06-01")!, /12 bulan/);
});

test("nama berkas: satu bulan penuh memakai tahun-bulan", () => {
  assert.equal(loadFileName("2026-12-01", "2026-12-31"), "BEBAN_PELAYAN_2026-12.xlsx");
  assert.equal(loadFileName("2024-02-01", "2024-02-29"), "BEBAN_PELAYAN_2024-02.xlsx");
  assert.equal(loadFileName("2026-12-05", "2026-12-31"), "BEBAN_PELAYAN_2026-12-05_2026-12-31.xlsx");
  assert.equal(loadFileName("2026-01-01", "2026-03-31"), "BEBAN_PELAYAN_2026-01-01_2026-03-31.xlsx");
});
