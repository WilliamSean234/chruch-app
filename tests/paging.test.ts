import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, pageOf, resolvePaging } from "../src/lib/paging";

test("ukuran halaman bawaan selalu yang terkecil (10)", () => {
  assert.equal(DEFAULT_PAGE_SIZE, 10);
  assert.equal(DEFAULT_PAGE_SIZE, Math.min(...PAGE_SIZES));
  assert.deepEqual(resolvePaging({ page: 1 }), { page: 1, pageSize: 10, skip: 0, take: 10 });
});

test("halaman, ukuran, dan nama lama 'limit'", () => {
  assert.deepEqual(resolvePaging({ page: 3 }), { page: 3, pageSize: 10, skip: 20, take: 10 });
  assert.equal(resolvePaging({ page: 2, pageSize: 25 }).skip, 25);
  assert.equal(resolvePaging({ page: 2, limit: 50 }).pageSize, 50);
});

test("bentuk respons daftar", () => {
  const r = pageOf(["a", "b"], 41, { page: 1, pageSize: 10 });
  assert.equal(r.pages, 5);
  assert.equal(r.total, 41);
  assert.equal(pageOf([], 0, { page: 1, pageSize: 10 }).pages, 1);
});
