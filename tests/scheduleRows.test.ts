import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeTwinRehearsalRows } from "../src/lib/scheduleRows";

const reh = (eventId: string, title: string, status = "PUBLISHED", start = "2026-12-10T12:00:00.000Z") => ({
  key: `r-${eventId}`, kind: "REHEARSAL" as const, eventId, title: `Latihan ${title}`, startsAt: start, endsAt: "2026-12-10T14:00:00.000Z", room: "KU", status,
  events: [{ id: eventId, title, startsAt: start.replace("12:00", "00:00"), endsAt: "x", status }],
});
const svc = (eventId: string) => ({ key: `e-${eventId}`, kind: "SERVICE" as const, eventId, title: "Ibadah Minggu I", startsAt: "2026-12-13T00:00:00.000Z", endsAt: "2026-12-13T02:00:00.000Z", room: "KU", status: "PUBLISHED" });

test("latihan kembar Minggu I dan II jadi satu baris", () => {
  const r = mergeTwinRehearsalRows([reh("a", "Ibadah Minggu I"), reh("b", "Ibadah Minggu II", "DRAFT"), svc("a")]);
  assert.equal(r.length, 2);
  assert.equal(r[0].title, "Latihan Ibadah Minggu");
  assert.equal(r[0].status, "PUBLISHED"); // salah satunya terbit
  assert.deepEqual(r[0].events?.map((e) => e.id), ["a", "b"]);
  assert.equal(r[1].kind, "SERVICE");
});

test("keduanya draf tetap draf; jam berbeda tidak digabung; latihan sendirian tidak berubah", () => {
  const both = mergeTwinRehearsalRows([reh("a", "Ibadah Minggu I", "DRAFT"), reh("b", "Ibadah Minggu II", "DRAFT")]);
  assert.equal(both.length, 1); assert.equal(both[0].status, "DRAFT");
  const apart = mergeTwinRehearsalRows([reh("a", "Ibadah Minggu I"), reh("b", "Ibadah Minggu II", "PUBLISHED", "2026-12-12T12:00:00.000Z")]);
  assert.equal(apart.length, 2);
  assert.equal(apart[0].title, "Latihan Ibadah Minggu I");
});

test("judul beda dasar tidak disingkat", () => {
  const r = mergeTwinRehearsalRows([reh("a", "Ibadah Natal"), reh("b", "Ibadah Tahun Baru")]);
  assert.equal(r[0].title, "Latihan Ibadah Natal & Ibadah Tahun Baru");
});
