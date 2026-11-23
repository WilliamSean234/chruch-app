/** Alat kecil untuk pengingat terjadwal. Murni (tanpa database) supaya mudah diuji. Tanggal berbentuk "YYYY-MM-DD" (zona waktu gereja). */

export const addDaysYmd = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** Selisih hari a - b. */
export const diffDaysYmd = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

/** Gabungkan beberapa butir dengan "; " dan ringkas sisanya: "a; b; c; +2 lainnya". */
export function limitedList(items: string[], max: number): string {
  if (items.length <= max) return items.join("; ");
  return `${items.slice(0, max).join("; ")}; +${items.length - max} lainnya`;
}

/** Sidik pendek yang stabil untuk teks (djb2), dipakai membuat kunci pesan. */
export function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Bulan dari tanggal: kunci "YYYY-MM", hari pertama, dan hari pertama bulan berikutnya. */
export function monthBounds(ymd: string) {
  const y = Number(ymd.slice(0, 4)), m = Number(ymd.slice(5, 7));
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const nd = new Date(Date.UTC(y, m, 1));
  return { month: from.slice(0, 7), from, next: `${nd.getUTCFullYear()}-${String(nd.getUTCMonth() + 1).padStart(2, "0")}-01`, year: y, monthIndex: m - 1 };
}

/** "3 pelayanan, 2 latihan, 1 rapat." Bagian yang nol dihilangkan; kosong semua = "". */
export function digestSummary(c: { acara: number; latihan: number; rapat: number }): string {
  const parts = [c.acara && `${c.acara} pelayanan`, c.latihan && `${c.latihan} latihan`, c.rapat && `${c.rapat} rapat`].filter(Boolean);
  return parts.length ? `${parts.join(", ")}.` : "";
}

/** Tahap pengingat kehadiran: 1 = pertama kali, 2 = pengingat ulang (acara sudah 3 hari atau lebih). null = tidak perlu kirim. */
export function attendanceStage(ageDays: number, has: { first: boolean; second: boolean }): 1 | 2 | null {
  if (ageDays >= 3) return has.second ? null : 2;
  return has.first ? null : 1;
}
