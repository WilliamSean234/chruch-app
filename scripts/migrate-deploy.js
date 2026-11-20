// Menjalankan `prisma migrate deploy` dengan percobaan ulang.
// Neon (paket gratis) menidurkan database yang lama tidak dipakai; koneksi pertama sering gagal (P1001/P1002)
// sampai database bangun. Percobaan berikutnya biasanya berhasil, jadi deploy tidak perlu diulang manual.
// Kesalahan lain (mis. migrasi yang gagal) langsung dihentikan tanpa diulang.
const { spawnSync } = require("node:child_process");

const MAX = 6;
const WAIT_MS = 10000;
const TRANSIENT = /P1001|P1002|P1017|Can't reach database server|timed out/i;

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

for (let i = 1; i <= MAX; i++) {
  console.log(`\n[migrate] percobaan ${i}/${MAX}`);
  const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8", shell: process.platform === "win32" });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  process.stdout.write(out);
  if (r.status === 0) process.exit(0);
  if (!TRANSIENT.test(out) || i === MAX) {
    console.error(`\n[migrate] gagal${TRANSIENT.test(out) ? ` setelah ${MAX} percobaan: database tidak terjangkau` : ""}.`);
    process.exit(r.status || 1);
  }
  console.log(`[migrate] database belum terjangkau (mungkin sedang bangun). Coba lagi dalam ${WAIT_MS / 1000} detik…`);
  sleep(WAIT_MS);
}
