import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.MINUTES_ENC_KEY = randomBytes(32).toString("base64");
const m = await import("../src/lib/meetingCrypto");
const { isEncrypted } = await import("../src/lib/fieldCrypto");

test("judul, alasan batal, tautan, tamu, dan catatan terenkripsi lalu terbaca kembali", () => {
  const t = m.sealTitle("e1", "Rencana anggaran 2027");
  assert.ok(isEncrypted(t) && !t.includes("anggaran"));
  assert.equal(m.openTitle("e1", t), "Rencana anggaran 2027");

  const r = m.sealReason("e1", "Pembicara sakit");
  assert.ok(isEncrypted(r!));
  assert.equal(m.openReason("e1", r), "Pembicara sakit");
  assert.equal(m.sealReason("e1", ""), null);
  assert.equal(m.openReason("e1", null), null);

  const l = m.sealLink("e1", { title: "Zoom rapat", url: "https://zoom.us/j/123" });
  assert.ok(isEncrypted(l.title) && isEncrypted(l.url) && !l.url.includes("zoom"));
  assert.deepEqual(m.openLink("e1", { id: "x", ...l }), { id: "x", title: "Zoom rapat", url: "https://zoom.us/j/123" });

  assert.equal(m.openGuest("e1", m.sealGuest("e1", "Pdt. Budi")), "Pdt. Budi");
  assert.equal(m.openNote("e1", m.sealNote("e1", "izin terlambat")), "izin terlambat");
  assert.equal(m.sealNote("e1", undefined), null);
});

test("data lama tanpa awalan tetap terbaca", () => {
  assert.equal(m.openTitle("e1", "Judul lama"), "Judul lama");
  assert.equal(m.openLink("e1", { title: "a", url: "b" }).url, "b");
});

test("isi terikat ke rapat dan jenis isiannya: dipindah ke rapat atau kolom lain gagal dibuka", () => {
  const t = m.sealTitle("e1", "Rahasia");
  assert.throws(() => m.openTitle("e2", t));
  assert.throws(() => m.openReason("e1", t));
});

test("openMeetingRow membuka judul, alasan batal, dan tautan sekaligus", () => {
  const row = { id: "e9", title: m.sealTitle("e9", "Topik"), cancelReason: m.sealReason("e9", "Libur"), links: [{ id: "l", ...m.sealLink("e9", { title: "T", url: "U" }) }], other: 1 };
  const o = m.openMeetingRow(row);
  assert.equal(o.title, "Topik");
  assert.equal(o.cancelReason, "Libur");
  assert.deepEqual(o.links[0], { id: "l", title: "T", url: "U" });
  assert.equal(o.other, 1);
});
