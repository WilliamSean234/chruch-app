import test from "node:test";
import assert from "node:assert/strict";
import { QR_MAX_BYTES, qrMatrix, qrSvgPath } from "../src/lib/qr";

// Keluaran ini juga diperiksa dengan pemindai QR sungguhan (OpenCV) saat dibuat; di sini hanya bentuk dasarnya.
test("ukuran mengikuti panjang teks dan pola sudut ada", () => {
  const sizes: [number, number][] = [[1, 21], [17, 21], [18, 25], [53, 29], [78, 33], [106, 37], [134, 41], [154, 45], [192, 49], [230, 53], [QR_MAX_BYTES, 57]];
  for (const [len, size] of sizes) {
    const m = qrMatrix("a".repeat(len));
    assert.equal(m.length, size, `len=${len}`);
    assert.ok(m.every((r) => r.length === size));
    // pola sudut: bingkai 7x7 gelap, 5x5 terang, inti 3x3 gelap, di tiga sudut
    for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]] as const) {
      assert.equal(m[oy]![ox], true); assert.equal(m[oy + 1]![ox + 1], false); assert.equal(m[oy + 3]![ox + 3], true);
    }
    assert.equal(m[size - 8]![8], true); // modul gelap tetap
  }
});

test("teks terlalu panjang ditolak, hasil selalu sama untuk teks yang sama", () => {
  assert.throws(() => qrMatrix("x".repeat(QR_MAX_BYTES + 1)), RangeError);
  assert.deepEqual(qrMatrix("otpauth://totp/a?secret=ABC"), qrMatrix("otpauth://totp/a?secret=ABC"));
  assert.equal(qrMatrix("é".repeat(10)).length, 25); // UTF-8: 20 byte
});

test("jalur SVG: ukuran termasuk batas putih dan hanya berisi perintah yang dikenal", () => {
  const m = qrMatrix("halo");
  const { d, size } = qrSvgPath(m, 4);
  assert.equal(size, m.length + 8);
  assert.match(d, /^(M\d+ \d+h\d+v1h-\d+z)+$/);
});
