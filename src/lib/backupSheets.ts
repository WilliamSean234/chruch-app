/**
 * Bagian murni dari cadangan Excel (tanpa database), supaya mudah diuji: bentuk lembar, nama lembar, dan format tanggal.
 * Isi yang diambil dari database ada di backup.ts.
 */
import type { XCell, XSheetSpec } from "./xlsxWrite";

export type BackupCell = string | number | null | undefined;
export type BackupCol = { head: string; width: number };

const BAD_SHEET_CHARS = /[\[\]:*?/\\]/g;

/** Nama lembar Excel: maksimal 31 huruf, tanpa [ ] : * ? / \, dan tidak kembar dengan yang sudah dipakai (tanpa membedakan huruf besar kecil). */
export function sheetName(raw: string, used: Set<string>): string {
  const base = (raw.replace(BAD_SHEET_CHARS, " ").replace(/\s+/g, " ").trim() || "Lembar").slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

/** Satu lembar tabel: baris 1 judul kolom, sisanya data. Sel kosong tetap diberi garis supaya tabelnya rapi. */
export function tableSheet(name: string, cols: BackupCol[], rows: BackupCell[][]): XSheetSpec {
  const cells: XCell[] = cols.map((c, i) => ({ r: 1, c: i + 1, v: c.head, s: "head" }));
  rows.forEach((row, ri) => {
    cols.forEach((_, ci) => {
      const v = row[ci];
      cells.push({ r: ri + 2, c: ci + 1, v: v === null || v === undefined ? "" : v, s: "cell" });
    });
  });
  return { name, cols: cols.map((c) => c.width), cells };
}

/** Lembar teks biasa (petunjuk): satu kolom lebar, tiap elemen satu baris. Elemen berawalan "# " dicetak tebal, "- " dibiarkan biasa. */
export function noteSheet(name: string, lines: string[]): XSheetSpec {
  const cells: XCell[] = lines.map((t, i) => (t.startsWith("# ") ? { r: i + 1, c: 1, v: t.slice(2), s: "bold" as const } : { r: i + 1, c: 1, v: t, s: "plain" as const }));
  return { name, cols: [110], cells };
}

const TZ = "Asia/Jakarta";
const part = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, ...o }).format(d);

/** "2026-11-25" menurut waktu Jakarta. Kosong bila tanggalnya tidak ada. */
export const dateText = (d: Date | null | undefined): string => (d ? part(d, { year: "numeric", month: "2-digit", day: "2-digit" }) : "");
/** "07:00" menurut waktu Jakarta. */
export const timeText = (d: Date | null | undefined): string => (d ? new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d) : "");
/** Tanggal lahir disimpan sebagai tanggal saja (tanpa zona): ambil bagian tanggalnya apa adanya. */
export const birthText = (d: Date | null | undefined): string => (d ? d.toISOString().slice(0, 10) : "");

export const backupFileName = (now: Date) => `CADANGAN_GEREJA_${dateText(now)}.xlsx`;

/** Awal rentang jadwal yang dicadangkan: 12 bulan ke belakang (semua yang akan datang ikut). */
export const BACKUP_MONTHS_BACK = 12;
export function backupFrom(now: Date): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - BACKUP_MONTHS_BACK);
  return d;
}

/** Daftar nama dipisah koma, tanpa yang kosong dan tanpa yang kembar, urut abjad. */
export const joinNames = (xs: (string | null | undefined)[]): string => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "id")).join(", ");
