import { COLS, norm, SHEET_LIST, type Row, type SheetKey } from "./common";
import { readXlsx } from "./xlsx";

export type Parsed = {
  rows: Record<SheetKey, Row[]>;
  found: Set<SheetKey>;
  headerErrors: Partial<Record<SheetKey, string[]>>;
  unknownSheets: string[];
};

/** Baca file Excel menjadi baris-baris teks per sheet. Baris kosong dan baris "contoh" dilewati. */
export function parseWorkbook(buf: Buffer): Parsed {
  const sheets = readXlsx(buf);

  const rows = Object.fromEntries(SHEET_LIST.map((s) => [s.key, [] as Row[]])) as Record<SheetKey, Row[]>;
  const found = new Set<SheetKey>();
  const headerErrors: Parsed["headerErrors"] = {};
  const unknownSheets: string[] = [];
  const byName = new Map(SHEET_LIST.map((s) => [norm(s.key), s.key as SheetKey]));

  for (const ws of sheets) {
    const key = byName.get(norm(ws.name));
    if (!key) {
      if (norm(ws.name) !== "petunjuk") unknownSheets.push(ws.name);
      continue;
    }
    found.add(key);
    const spec = COLS[key];
    const wanted = new Map(Object.entries(spec).map(([id, title]) => [norm(title), id]));

    // cari baris judul (di template: baris 3)
    let headerRow = 0;
    const colOf = new Map<string, number>();
    let noCol = 0;
    for (let r = 1; r <= Math.min(10, ws.maxRow); r++) {
      const hit = new Map<string, number>();
      let no = 0;
      for (const [c, text] of ws.cells.get(r) ?? []) {
        const t = norm(text);
        if (t === "no") no = c;
        const id = wanted.get(t);
        if (id && !hit.has(id)) hit.set(id, c);
      }
      if (hit.size >= Math.min(2, wanted.size)) {
        headerRow = r;
        hit.forEach((c, id) => colOf.set(id, c));
        noCol = no;
        break;
      }
    }
    if (!headerRow) {
      headerErrors[key] = ["Judul kolom tidak ditemukan. Pakai template resmi dan jangan ubah nama kolom."];
      continue;
    }
    const missing = Object.entries(spec).filter(([id]) => !colOf.has(id)).map(([, title]) => title);
    if (missing.length) headerErrors[key] = [`Kolom tidak ditemukan: ${missing.join(", ")}.`];

    for (let r = headerRow + 1; r <= ws.maxRow; r++) {
      const cells = ws.cells.get(r);
      if (!cells) continue;
      const v: Record<string, string> = {};
      let any = false;
      for (const id of Object.keys(spec)) {
        const c = colOf.get(id);
        const t = c ? cells.get(c) ?? "" : "";
        v[id] = t;
        if (t) any = true;
      }
      if (!any) continue;
      if (noCol && norm(cells.get(noCol) ?? "") === "contoh") continue;
      rows[key].push({ n: r, v });
    }
  }

  return { rows, found, headerErrors, unknownSheets };
}
