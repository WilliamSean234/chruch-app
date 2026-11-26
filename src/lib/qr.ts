/**
 * Pembuat kode QR kecil tanpa paket tambahan, khusus teks pendek (tautan otpauth:// untuk verifikasi 2 langkah).
 * Mode byte (UTF-8), koreksi galat tingkat L, versi 1 sampai 10 (sampai 271 byte). Murni dan tanpa DOM, jadi bisa dipakai di server maupun klien.
 * Hasilnya diperiksa dengan pemindai QR sungguhan, bukan hanya dibandingkan dengan keluaran sendiri.
 */

// Jumlah codeword total per versi (indeks 0 = versi 1)
const TOTAL_CW = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
// Tingkat L: codeword koreksi per blok dan jumlah blok
const ECC_PER_BLOCK = [7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
const NUM_BLOCKS = [1, 1, 1, 1, 1, 2, 2, 2, 2, 4];
// Pusat pola penyelaras per versi
const ALIGN: number[][] = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

export const QR_MAX_BYTES = 271;

const dataCodewords = (v: number) => TOTAL_CW[v - 1]! - ECC_PER_BLOCK[v - 1]! * NUM_BLOCKS[v - 1]!;
const sizeOf = (v: number) => 17 + 4 * v;

// ───────── Reed-Solomon di GF(256), polinom 0x11D ─────────
function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 255;
}
function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMul(result[j]!, root);
      if (j + 1 < degree) result[j] = result[j]! ^ result[j + 1]!;
    }
    root = gfMul(root, 2);
  }
  return result;
}
function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ result.shift()!;
    result.push(0);
    for (let i = 0; i < divisor.length; i++) result[i] = result[i]! ^ gfMul(divisor[i]!, factor);
  }
  return result;
}

// ───────── Data → codeword ─────────
function utf8(text: string): number[] { return [...new TextEncoder().encode(text)]; }

function versionFor(len: number): number {
  for (let v = 1; v <= 10; v++) {
    const ccBits = v <= 9 ? 8 : 16;
    if (4 + ccBits + 8 * len <= dataCodewords(v) * 8) return v;
  }
  throw new RangeError(`Teks terlalu panjang untuk kode QR (${len} byte, maksimal ${QR_MAX_BYTES}).`);
}

function dataBits(bytes: number[], version: number): number[] {
  const bits: number[] = [];
  const put = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4); // mode byte
  put(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCodewords(version) * 8;
  put(0, Math.min(4, cap - bits.length)); // penutup
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  return bits;
}

/** Bagi data menjadi blok, hitung koreksi galat tiap blok, lalu selang-seling (data dulu, lalu koreksi). */
function interleave(data: number[], version: number): number[] {
  const nb = NUM_BLOCKS[version - 1]!, eccLen = ECC_PER_BLOCK[version - 1]!, total = TOTAL_CW[version - 1]!;
  const shortCount = nb - (total % nb);
  const shortLen = Math.floor(total / nb) - eccLen; // panjang data blok pendek
  const divisor = rsDivisor(eccLen);
  const blocks: { data: number[]; ecc: number[] }[] = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const len = shortLen + (i < shortCount ? 0 : 1);
    const d = data.slice(k, k + len);
    k += len;
    blocks.push({ data: d, ecc: rsRemainder(d, divisor) });
  }
  const out: number[] = [];
  const maxData = Math.max(...blocks.map((b) => b.data.length));
  for (let i = 0; i < maxData; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]!);
  for (let i = 0; i < eccLen; i++) for (const b of blocks) out.push(b.ecc[i]!);
  return out;
}

// ───────── Matriks ─────────
type Grid = { size: number; dark: boolean[][]; fn: boolean[][] };

function newGrid(size: number): Grid {
  const make = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  return { size, dark: make(), fn: make() };
}
function setFn(g: Grid, x: number, y: number, dark: boolean) {
  if (x < 0 || y < 0 || x >= g.size || y >= g.size) return;
  g.dark[y]![x] = dark;
  g.fn[y]![x] = true;
}

function drawFormat(g: Grid, mask: number) {
  const data = (0b01 << 3) | mask; // tingkat L = 01
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const bits = ((data << 10) | rem) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) setFn(g, 8, i, bit(i));
  setFn(g, 8, 7, bit(6));
  setFn(g, 8, 8, bit(7));
  setFn(g, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) setFn(g, 14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) setFn(g, g.size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) setFn(g, 8, g.size - 15 + i, bit(i));
  setFn(g, 8, g.size - 8, true); // modul gelap tetap
}

function drawVersion(g: Grid, version: number) {
  if (version < 7) return;
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  const bits = (version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const b = ((bits >>> i) & 1) === 1;
    const a = g.size - 11 + (i % 3), c = Math.floor(i / 3);
    setFn(g, a, c, b);
    setFn(g, c, a, b);
  }
}

function drawFunctionPatterns(g: Grid, version: number) {
  for (let i = 0; i < g.size; i++) { setFn(g, 6, i, i % 2 === 0); setFn(g, i, 6, i % 2 === 0); } // garis waktu
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFn(g, cx + dx, cy + dy, dist !== 2 && dist !== 4);
    }
  };
  finder(3, 3); finder(g.size - 4, 3); finder(3, g.size - 4);
  const pos = ALIGN[version - 1]!;
  for (let i = 0; i < pos.length; i++) for (let j = 0; j < pos.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue; // bertabrakan dengan pola sudut
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(g, pos[i]! + dx, pos[j]! + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  drawFormat(g, 0); // sementara; ditimpa setelah topeng dipilih
  drawVersion(g, version);
}

function placeCodewords(g: Grid, cw: number[]) {
  let i = 0;
  const total = cw.length * 8;
  for (let right = g.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < g.size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const upward = ((right + 1) & 2) === 0;
      const y = upward ? g.size - 1 - vert : vert;
      if (!g.fn[y]![x] && i < total) { g.dark[y]![x] = ((cw[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];
function applyMask(g: Grid, mask: number) {
  const f = MASKS[mask]!;
  for (let y = 0; y < g.size; y++) for (let x = 0; x < g.size; x++) if (!g.fn[y]![x] && f(x, y)) g.dark[y]![x] = !g.dark[y]![x];
}

/** Nilai penalti standar (aturan 1 sampai 4); topeng dengan penalti terendah dipakai. */
function penalty(g: Grid): number {
  const n = g.size, d = g.dark;
  let p = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i < n; i++) {
      if (get(i) === get(i - 1)) { run++; if (run === 5) p += 3; else if (run > 5) p += 1; } else run = 1;
    }
    for (let i = 0; i + 11 <= n; i++) { // pola mirip pola sudut (1:1:3:1:1) dengan 4 modul terang di salah satu sisi
      const a = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], b = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
      let ma = true, mb = true;
      for (let k = 0; k < 11; k++) { const v = get(i + k) ? 1 : 0; if (v !== a[k]) ma = false; if (v !== b[k]) mb = false; }
      if (ma) p += 40;
      if (mb) p += 40;
    }
  };
  for (let y = 0; y < n; y++) line((x) => d[y]![x]!);
  for (let x = 0; x < n; x++) line((y) => d[y]![x]!);
  for (let y = 0; y + 1 < n; y++) for (let x = 0; x + 1 < n; x++) { const c = d[y]![x]; if (c === d[y]![x + 1] && c === d[y + 1]![x] && c === d[y + 1]![x + 1]) p += 3; }
  let dark = 0;
  for (const row of d) for (const c of row) if (c) dark++;
  const total = n * n;
  p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return p;
}

/** Matriks QR (true = modul gelap) untuk sebuah teks. Melempar RangeError bila terlalu panjang. */
export function qrMatrix(text: string, forceMask?: number): boolean[][] {
  const bytes = utf8(text);
  const version = versionFor(bytes.length);
  const bits = dataBits(bytes, version);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let k = 0; k < 8; k++) b = (b << 1) | bits[i + k]!; data.push(b); }
  const codewords = interleave(data, version);

  const g = newGrid(sizeOf(version));
  drawFunctionPatterns(g, version);
  placeCodewords(g, codewords);

  let best = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(g, m);
    drawFormat(g, m);
    const s = penalty(g);
    if (s < bestScore) { bestScore = s; best = m; }
    applyMask(g, m); // batalkan (XOR dua kali)
  }
  if (forceMask !== undefined) best = forceMask; // hanya untuk pengujian
  applyMask(g, best);
  drawFormat(g, best);
  return g.dark.map((r) => r.slice());
}

/** Jalur SVG (satu path) untuk matriks, dengan batas putih `quiet` modul di sekelilingnya. Ukuran kotak: (jumlah modul + 2×quiet). */
export function qrSvgPath(m: boolean[][], quiet = 4): { d: string; size: number } {
  const parts: string[] = [];
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m.length; x++) {
      if (!m[y]![x]) continue;
      let w = 1;
      while (x + w < m.length && m[y]![x + w]) w++;
      parts.push(`M${x + quiet} ${y + quiet}h${w}v1h-${w}z`);
      x += w - 1;
    }
  }
  return { d: parts.join(""), size: m.length + quiet * 2 };
}
