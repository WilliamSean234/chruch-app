import { inflateRawSync } from "node:zlib";

/** Pembaca .xlsx minimal (zip + XML), tanpa dependensi. Cukup untuk membaca teks, angka, tanggal dan jam per sel. */

function unzip(buf: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Bukan file zip/xlsx.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Daftar isi zip rusak.");
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + compSize);
    out.set(name, method === 0 ? raw : inflateRawSync(raw));
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(+d))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/_x[0-9a-fA-F]{4}_/g, "");

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

/** Gabungkan semua <t>…</t> dalam satu potongan XML (abaikan catatan fonetik <rPh>). */
function textOf(xml: string): string {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let s = "";
  for (const m of clean.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) s += m[1] ?? "";
  return decode(s);
}

const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const isDateFormat = (code: string) => /[dmyhs]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ""));

/** Sel gabungan: nilainya hanya ada di sel kiri atas (baris r1, kolom c1). */
export type XMerge = { r1: number; c1: number; r2: number; c2: number };
export type XSheet = { name: string; maxRow: number; cells: Map<number, Map<number, string>>; merges?: XMerge[] };

const colNum = (letters: string) => letters.split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

function serialText(v: number): string {
  if (v >= 1) return new Date(Math.round((Math.floor(v) - 25569) * 86_400_000)).toISOString().slice(0, 10);
  const t = Math.round(v * 1440);
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function readXlsx(buf: Buffer): XSheet[] {
  const z = unzip(buf);
  const str = (name: string) => z.get(name)?.toString("utf8") ?? "";

  const shared: string[] = [];
  for (const m of str("xl/sharedStrings.xml").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) shared.push(textOf(m[1] ?? ""));

  // gaya sel → apakah tanggal/jam
  const styles = str("xl/styles.xml");
  const custom = new Map<number, string>();
  for (const m of styles.matchAll(/<numFmt\b[^>]*>/g)) { const id = attr(m[0], "numFmtId"), code = attr(m[0], "formatCode"); if (id && code) custom.set(+id, decode(code)); }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
  const dateStyle: boolean[] = [];
  for (const m of xfs.matchAll(/<xf\b[^>]*?(?:\/>|>)/g)) {
    const id = +(attr(m[0], "numFmtId") ?? 0);
    dateStyle.push(BUILTIN_DATE.has(id) || (custom.has(id) && isDateFormat(custom.get(id)!)));
  }

  const rels = new Map<string, string>();
  for (const m of str("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id"), target = attr(m[0], "Target");
    if (id && target) rels.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }

  const sheets: XSheet[] = [];
  for (const m of str("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const name = decode(attr(m[0], "name") ?? "");
    const rid = /\br:id="([^"]*)"/.exec(m[0])?.[1];
    const path = rid ? rels.get(rid) : undefined;
    const xml = path ? z.get(path)?.toString("utf8") : undefined;
    if (!xml) continue;
    const cells = new Map<number, Map<number, string>>();
    let maxRow = 0;
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /^([A-Z]+)(\d+)$/.exec(attr(c[1], "r") ?? "");
      if (!ref || c[2] === undefined) continue;
      const t = attr(c[1], "t");
      const s = attr(c[1], "s");
      const v = /<v>([\s\S]*?)<\/v>/.exec(c[2])?.[1];
      let text = "";
      if (t === "inlineStr") text = textOf(c[2]);
      else if (v === undefined) text = "";
      else if (t === "s") text = shared[+v] ?? "";
      else if (t === "str" || t === "d") text = decode(v);
      else if (t === "b") text = v === "1" ? "Ya" : "Tidak";
      else if (t === "e") text = "";
      else {
        const num = Number(v);
        text = Number.isFinite(num) ? (s !== undefined && dateStyle[+s] ? serialText(num) : String(num)) : decode(v);
      }
      text = text.trim();
      if (!text) continue;
      const r = +ref[2];
      const row = cells.get(r) ?? new Map<number, string>();
      row.set(colNum(ref[1]), text);
      cells.set(r, row);
      if (r > maxRow) maxRow = r;
    }
    const merges: XMerge[] = [];
    for (const mm of xml.matchAll(/<mergeCell\b[^>]*\bref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/g)) merges.push({ c1: colNum(mm[1]!), r1: +mm[2]!, c2: colNum(mm[3]!), r2: +mm[4]! });
    sheets.push({ name, maxRow, cells, merges });
  }
  return sheets;
}
