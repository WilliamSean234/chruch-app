import test from "node:test";
import assert from "node:assert/strict";
import { audienceBody, audienceFromIds, audienceProblem, emptyAudience } from "../src/lib/audienceForm";

test("acara umum: tidak ada komunitas dan tidak ada masalah", () => {
  assert.deepEqual(audienceFromIds([]), emptyAudience);
  assert.deepEqual(audienceFromIds(undefined), emptyAudience);
  assert.deepEqual(audienceBody(emptyAudience), []);
  assert.equal(audienceProblem(emptyAudience), null);
});

test("acara khusus: komunitas dari server (objek atau id) menjadi pilihan form dan dikirim balik", () => {
  const v = audienceFromIds([{ id: "a" }, { id: "b" }]);
  assert.deepEqual(v, { on: true, ids: ["a", "b"] });
  assert.deepEqual(audienceFromIds(["a"]), { on: true, ids: ["a"] });
  assert.deepEqual(audienceBody(v), ["a", "b"]);
  assert.equal(audienceProblem(v), null);
});

test("dinyalakan tetapi belum memilih komunitas: ditolak; dimatikan: dikirim kosong walau ada sisa pilihan", () => {
  assert.match(audienceProblem({ on: true, ids: [] })!, /Pilih komunitas/);
  assert.deepEqual(audienceBody({ on: false, ids: ["a"] }), []);
});
