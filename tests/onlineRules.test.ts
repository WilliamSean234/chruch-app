import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanOnlineUrl, linkVisible } from "../src/lib/onlineRules";

test("tautan tanpa skema diberi https, spasi dibuang", () => {
  assert.equal(cleanOnlineUrl("zoom.us/j/123"), "https://zoom.us/j/123");
  assert.equal(cleanOnlineUrl("  https://meet.google.com/abc-defg-hij "), "https://meet.google.com/abc-defg-hij");
});

test("tautan kosong, skema lain, dan alamat tanpa domain ditolak", () => {
  for (const bad of ["", "javascript:alert(1)", "ftp://x.com/a", "abc"]) assert.throws(() => cleanOnlineUrl(bad), undefined, bad);
  assert.throws(() => cleanOnlineUrl(null));
});

test("tautan ibadah: semua orang vs komunitas tertentu", () => {
  const base = { scheduler: false, restricted: false, involved: false, inCommunity: false };
  assert.equal(linkVisible(base), true);
  assert.equal(linkVisible({ ...base, restricted: true }), false);
  assert.equal(linkVisible({ ...base, restricted: true, inCommunity: true }), true);
  assert.equal(linkVisible({ ...base, restricted: true, involved: true }), true);
  assert.equal(linkVisible({ ...base, restricted: true, scheduler: true }), true);
});
