/**
 * Menggabungkan jadwal beberapa tim menjadi satu tabel melebar: tanggal di kiri, lalu blok kolom tiap tim berdampingan.
 * Murni (tanpa database) supaya mudah diuji. Hasilnya ExportModel biasa bertanda `pen` + `multi`, jadi gambar, PDF, Excel
 * dan layar memakai header dua baris yang sama dengan Penatalayan: baris atas nama tim, baris bawah nama kolom.
 */
import type { ExportModel } from "./teamSchedule";

/** Kolom atribut acara Penatalayan ("@band", "@padus", "@theme") sudah unik antar tim, jadi tidak diberi awalan. */
const keyOf = (format: string, key: string) => (key.startsWith("@") ? key : `${format}:${key}`);

export const COMBINED_FORMAT = "gabungan";

export function mergeModels(models: ExportModel[]): ExportModel {
  if (models.length === 0) throw new Error("Tidak ada jadwal untuk digabung.");
  if (models.length === 1) return models[0]!;
  const first = models[0]!;

  const columns: ExportModel["columns"] = [];
  const groups: NonNullable<ExportModel["groups"]> = [];
  for (const m of models) {
    const keys = m.columns.map((c) => keyOf(m.format, c.key));
    m.columns.forEach((c, i) => columns.push({ key: keys[i]!, label: c.label }));
    groups.push({ label: m.teamShort, keys });
  }

  // semua model dibuat dari bulan dan hari Minggu yang sama; tetap dicocokkan lewat tanggal supaya aman
  const months: ExportModel["months"] = first.months.map((mo) => ({
    month: mo.month,
    name: mo.name,
    rows: mo.rows.map((row) => {
      const cells: Record<string, string> = {};
      let differs = false;
      for (const m of models) {
        const src = m.months.find((x) => x.month === mo.month)?.rows.find((x) => x.date === row.date);
        if (!src) continue;
        for (const c of m.columns) cells[keyOf(m.format, c.key)] = src.cells[c.key] ?? "";
        if (src.differs) differs = true;
      }
      return { date: row.date, day: row.day, cells, differs };
    }),
  }));

  return {
    format: COMBINED_FORMAT,
    title: `JADWAL ${models.map((m) => m.teamShort.toUpperCase()).join(" + ")}`,
    year: first.year,
    teamShort: "Gabungan",
    columns,
    groups,
    pen: true,
    multi: true,
    months,
    hasDiff: models.some((m) => m.hasDiff),
  };
}
