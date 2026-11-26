import test from "node:test";
import assert from "node:assert/strict";
import { hasFlower } from "../src/lib/personalTouch";

test("bunga hanya untuk Jessica Gabriella Wahyudi, huruf besar-kecil dan spasi diabaikan", () => {
  assert.equal(hasFlower("Jessica Gabriella Wahyudi"), true);
  assert.equal(hasFlower("  jessica   gabriella wahyudi "), true);
  assert.equal(hasFlower("JESSICA GABRIELLA WAHYUDI"), true);
  assert.equal(hasFlower("Ibu Jessica Gabriella Wahyudi"), true); // gelar diabaikan seperti pada pencegahan nama dobel
});
test("orang lain dan nama kosong tidak mendapat bunga", () => {
  assert.equal(hasFlower("Jessica"), false);
  assert.equal(hasFlower("Jessica Gabriella"), false);
  assert.equal(hasFlower("William"), false);
  assert.equal(hasFlower(""), false);
  assert.equal(hasFlower(null), false);
  assert.equal(hasFlower(undefined), false);
});
