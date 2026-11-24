import { COLS, k, norm, splitList, SHEET_LIST, type Row, type SheetKey } from "./common";
import type { XSheet } from "./xlsx";

/**
 * Pengubah jawaban "Formulir Pendataan Pelayanan Gereja" (kuesioner yang dikirim ke anggota gereja) menjadi
 * baris-baris yang sama dengan template impor, supaya file kuesioner bisa diunggah langsung di menu Impor.
 *
 * Fungsi murni: hanya membaca sheet hasil `readXlsx`, tidak menyentuh database. Nomor baris pada hasil periksa
 * adalah nomor baris di tab kuesioner asalnya.
 */

export type Converted = { rows: Record<SheetKey, Row[]>; found: Set<SheetKey>; notes: string[] };

/** Tim untuk tiap tab 3x. */
const TEAM_OF_TAB: Record<string, string> = { "3a": "Tim EBM", "3b": "Penatalayan ibadah", "3c": "Usher", "3d": "Tim publikasi" };

const cell = (ws: XSheet, r: number, c: number) => (ws.cells.get(r)?.get(c) ?? "").trim();
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const isExample = (ws: XSheet, r: number) => norm(cell(ws, r, 1)) === "contoh";
const isTick = (s: string) => !!s.trim() && !/^(tidak|t|no|n|-|0|false)$/i.test(s.trim());

/** Tab kuesioner dikenali dari nama sheet-nya: "1 Orang" dan salah satu dari "2 Tim...", "3A...", "5A...". */
export function isKuesioner(sheets: XSheet[]): boolean {
  const names = sheets.map((s) => norm(s.name));
  return names.some((n) => /^1 orang/.test(n)) && names.some((n) => /^(2 tim|3[a-d]\b|5[a-c]\b)/.test(n));
}

const sheetOf = (sheets: XSheet[], re: RegExp) => sheets.find((s) => re.test(norm(s.name)));

type Spec = Record<string, RegExp>;
/** Cari baris judul: baris pertama (mulai `from`, paling jauh 40 baris) yang memuat semua kolom wajib. */
function header(ws: XSheet, spec: Spec, must: string[], from = 1): { row: number; col: Record<string, number> } | null {
  for (let r = from; r <= Math.min(ws.maxRow, from + 40); r++) {
    const col: Record<string, number> = {};
    for (const [c, text] of ws.cells.get(r) ?? []) {
      const t = norm(text);
      for (const [id, re] of Object.entries(spec)) if (col[id] === undefined && re.test(t)) col[id] = c;
    }
    if (must.every((id) => col[id] !== undefined)) return { row: r, col };
  }
  return null;
}

export function convertKuesioner(sheets: XSheet[]): Converted {
  const rows = Object.fromEntries(SHEET_LIST.map((s) => [s.key, [] as Row[]])) as Record<SheetKey, Row[]>;
  const found = new Set<SheetKey>();
  const notes: string[] = [];
  const add = (key: SheetKey, n: number, v: Record<string, string>) => {
    const full: Record<string, string> = Object.fromEntries(Object.keys(COLS[key]).map((id) => [id, ""]));
    for (const [id, val] of Object.entries(v)) full[id] = val;
    rows[key].push({ n, v: full });
    found.add(key);
  };
  /** Baris tabel: dari baris sesudah judul sampai sebelum `until`; baris "Contoh" dilewati. */
  function* body(ws: XSheet, h: { row: number }, until = Infinity) {
    for (let r = h.row + 1; r <= ws.maxRow && r < until; r++) if (ws.cells.has(r) && !isExample(ws, r)) yield r;
  }

  const pelayananSeen = new Set<string>(); // tim|nama, supaya tidak terdaftar dua kali (impor menolak yang kembar)
  const addPelayanan = (n: number, team: string, name: string, rehearsal = "") => {
    const key = `${k(team)}|${k(name)}`;
    if (pelayananSeen.has(key)) return;
    pelayananSeen.add(key);
    add("Pelayanan", n, { team, name, rehearsal, bandOnly: "" });
  };

  // ── 6. CG & komunitas ────────────────────────────────────────────
  const wsCg = sheetOf(sheets, /^6\b/);
  const positionsUsed = new Map<string, number>(); // posisi di gereja yang dipakai → baris pertama pemakainya
  if (wsCg) {
    const hk = header(wsCg, { cg: /^nama kelompok cg/, leaders: /^nama pemimpin/ }, ["cg"]);
    const hc = header(wsCg, { name: /^nama komunitas/ }, ["name"]);
    if (hk) {
      for (const r of body(wsCg, hk, hc ? hc.row - 1 : Infinity)) {
        const cg = clean(cell(wsCg, r, hk.col.cg!));
        if (!cg) continue;
        add("Pilihan", r, { cg });
        for (const person of splitList(hk.col.leaders ? cell(wsCg, r, hk.col.leaders) : "")) add("CGLeader", r, { cg, person: clean(person) });
      }
    }
    if (hc) for (const r of body(wsCg, hc)) { const community = clean(cell(wsCg, r, hc.col.name!)); if (community) add("Pilihan", r, { community }); }
  }

  // ── 2. Tim & posisi (lebih dulu dari tab 3, karena membawa isian Wajib latihan) ──
  const wsTim = sheetOf(sheets, /^2\b/);
  if (wsTim) {
    const h = header(wsTim, { team: /^tim$/, name: /^posisi/, rehearsal: /^wajib latihan/, check: /^cek$/, fix: /^koreksi/ }, ["team", "name"]);
    if (h) {
      let slotNote = false;
      for (const r of body(wsTim, h)) {
        const team = clean(cell(wsTim, r, h.col.team!));
        const name = clean(cell(wsTim, r, h.col.name!));
        if (!team || !name) continue;
        const check = norm(cell(wsTim, r, h.col.check ?? 0));
        if (check === "hapus") { notes.push(`Pelayanan ${name} (${team}) ditandai Hapus. Impor tidak menghapus apa pun; hapus manual di menu Orang & pelayanan bila memang perlu.`); continue; }
        if (check === "perlu diubah") notes.push(`Pelayanan ${name} (${team}) ditandai Perlu diubah${h.col.fix ? `: "${cell(wsTim, r, h.col.fix)}"` : ""}. Ubah manual di aplikasi; impor tidak menimpa yang sudah ada.`);
        addPelayanan(r, team, name, cell(wsTim, r, h.col.rehearsal ?? 0));
        slotNote = true;
      }
      if (slotNote) notes.push("Kolom \"Jumlah orang per ibadah\" tidak diimpor; jumlah kursi tiap ibadah diatur di Template acara.");
    }
  }

  // ── 3A–3D. Anggota tiap tim → pelayanan tiap orang ────────────────
  type Held = { name: string; row: number; ministries: string[] };
  const held = new Map<string, Held>(); // kunci nama → pelayanannya
  const stopped = new Set<string>();
  for (const ws of sheets) {
    const m = /^(3[a-d])\b/.exec(norm(ws.name));
    if (!m) continue;
    const team = TEAM_OF_TAB[m[1]!];
    const h = header(ws, { name: /^nama$/, active: /^masih aktif/ }, ["name"]);
    if (!team || !h) { notes.push(`Tab "${ws.name}" tidak dikenali, jadi dilewati.`); continue; }
    // kolom posisi: dari kolom sesudah "Masih aktif" sampai "Posisi lain 1"; "Posisi lain 1-3" berisi nama posisi yang diketik sendiri
    const posCols: { col: number; name: string }[] = [];
    const otherCols: number[] = [];
    const start = (h.col.active ?? h.col.name!) + 1;
    for (const [c, text] of [...(ws.cells.get(h.row) ?? [])].sort((a, b) => a[0] - b[0])) {
      if (c < start) continue;
      const t = norm(text);
      if (/^posisi lain/.test(t)) otherCols.push(c);
      else if (t === "catatan") break;
      else if (!otherCols.length) posCols.push({ col: c, name: clean(text) });
    }
    for (const p of posCols) addPelayanan(h.row, team, p.name); // sudah ada di aplikasi → dilewati; belum ada → dibuat
    const coordinator = [...(ws.cells.get(3) ?? [])].filter(([c]) => c >= 2).map(([, t]) => t)[0];
    if (coordinator) notes.push(`Koordinator ${team}: ${coordinator}. Hanya dicatat; jadikan Admin Tim lewat menu Akun bila perlu.`);

    for (const r of body(ws, h)) {
      const name = clean(cell(ws, r, h.col.name!));
      if (!name) continue;
      const status = norm(cell(ws, r, h.col.active ?? 0));
      if (status === "berhenti") { stopped.add(k(name)); notes.push(`${name} berstatus Berhenti di tab ${ws.name}: pelayanannya tidak diimpor.`); continue; }
      const mins: string[] = [];
      for (const p of posCols) if (isTick(cell(ws, r, p.col))) mins.push(p.name);
      for (const c of otherCols) {
        const other = clean(cell(ws, r, c));
        if (!other) continue;
        addPelayanan(r, team, other);
        mins.push(other);
      }
      const key = k(name);
      const cur = held.get(key) ?? { name, row: r, ministries: [] };
      for (const x of mins) if (!cur.ministries.some((y) => k(y) === k(x))) cur.ministries.push(x);
      held.set(key, cur);
    }
  }

  // ── 1. Orang ─────────────────────────────────────────────────────
  const wsOrang = sheetOf(sheets, /^1 orang/);
  const orangNames = new Set<string>();
  if (wsOrang) {
    const h = header(wsOrang, {
      title: /^gelar/, name: /^nama lengkap/, nickname: /^nama panggilan/, gender: /^jk$/, birth: /^tanggal lahir/, cg: /^kelompok cg/, community: /^komunitas/, status: /^status/, phone: /^no hp/, email: /^email/,
    }, ["name"]);
    if (h) {
      let skippedContact = false;
      for (const r of body(wsOrang, h)) {
        const c = (id: string) => (h.col[id] ? cell(wsOrang, r, h.col[id]!) : "");
        const name = clean(c("name"));
        if (!name) continue;
        if (c("phone") || c("email")) skippedContact = true;
        const status = clean(c("status"));
        const position = !status ? "Jemaat" : /^pendeta/i.test(status) ? "Pendeta" : status; // "Pendeta / Hamba Tuhan" = Pendeta di aplikasi
        if (!positionsUsed.has(position)) positionsUsed.set(position, r);
        const mine = held.get(k(name));
        orangNames.add(k(name));
        add("Orang", r, {
          title: c("title"), name, nickname: c("nickname"), birth: c("birth"), gender: c("gender"), position, cg: clean(c("cg")), community: clean(c("community")),
          ministries: (!stopped.has(k(name)) && mine ? mine.ministries : []).join(", "),
        });
      }
      if (skippedContact) notes.push("No HP dan Email di tab 1 tidak diimpor (data Orang belum punya kolom itu). Email untuk login diisi di tab 4.");
    }
  }
  // orang yang hanya muncul di tab 3: pelayanannya ditambahkan ke orang yang sudah ada di aplikasi (bukan membuat orang baru)
  for (const [key, p] of held) {
    if (orangNames.has(key) || !p.ministries.length) continue;
    add("Orang", p.row, { name: p.name, ministries: p.ministries.join(", "), addOnly: "1" });
  }
  for (const [position, r] of positionsUsed) add("Pilihan", r, { position });

  // ── 4. Penjadwal & admin → akun ──────────────────────────────────
  const wsAkun = sheetOf(sheets, /^4\b/);
  if (wsAkun) {
    const h = header(wsAkun, { person: /^nama$/, role: /^peran$/, team: /^tim yang dikelola/, email: /^email/ }, ["person", "role"], 8);
    if (h) {
      for (const r of body(wsAkun, h)) {
        const person = clean(cell(wsAkun, r, h.col.person!));
        const roleRaw = clean(cell(wsAkun, r, h.col.role!));
        if (!person || !roleRaw) continue;
        const email = cell(wsAkun, r, h.col.email ?? 0);
        const role = /^pelayan/i.test(roleRaw) ? "Pelayan" : roleRaw;
        if (!email) { notes.push(`${person} (${role}) belum mengisi email, jadi akunnya tidak dibuat. Isi emailnya lalu unggah lagi, atau buat lewat menu Akun.`); continue; }
        add("Akun", r, { person, email, role, team: clean(cell(wsAkun, r, h.col.team ?? 0)) });
      }
    }
  }

  // ── 5A–5C. Kelompok rapat ────────────────────────────────────────
  const wsKel = sheetOf(sheets, /^5a\b/);
  if (wsKel) {
    const h = header(wsKel, { name: /^nama kelompok/, quorum: /^kuorum/ }, ["name"]);
    if (h) for (const r of body(wsKel, h)) { const name = clean(cell(wsKel, r, h.col.name!)); if (name) add("KelompokRapat", r, { name, quorum: cell(wsKel, r, h.col.quorum ?? 0) }); }
  }
  const wsJab = sheetOf(sheets, /^5b\b/);
  if (wsJab) {
    const h = header(wsJab, { group: /^kelompok$/, name: /^jabatan$/, seats: /^jumlah orang/, schedule: /^boleh menjadwalkan/, write: /^boleh menulis/, finalize: /^boleh memfinalkan/, manage: /^boleh mengatur/ }, ["group", "name"]);
    if (h) {
      for (const r of body(wsJab, h)) {
        const group = clean(cell(wsJab, r, h.col.group!));
        const name = clean(cell(wsJab, r, h.col.name!));
        if (!group || !name) continue; // baris kelompok yang jabatannya belum diisi
        const c = (id: string) => (h.col[id] ? cell(wsJab, r, h.col[id]!) : "");
        // di kuesioner kosong = tidak dibatasi; di impor kosong = 1 orang, jadi ditulis eksplisit
        add("JabatanKelompok", r, { group, name, seats: c("seats") || "tanpa batas", schedule: c("schedule"), write: c("write"), finalize: c("finalize"), manage: c("manage") });
      }
    }
  }
  const wsAng = sheetOf(sheets, /^5c\b/);
  if (wsAng) {
    const h = header(wsAng, { group: /^kelompok$/, person: /^nama$/, positions: /^jabatan/ }, ["group", "person"]);
    if (h) for (const r of body(wsAng, h)) {
      const group = clean(cell(wsAng, r, h.col.group!));
      const person = clean(cell(wsAng, r, h.col.person!));
      if (group && person) add("AnggotaKelompok", r, { group, person, positions: cell(wsAng, r, h.col.positions ?? 0) });
    }
  }

  // ── 7. Ruangan & ibadah rutin ────────────────────────────────────
  const wsRuang = sheetOf(sheets, /^7\b/);
  if (wsRuang) {
    const hs = header(wsRuang, { name: /^nama ibadah/, day: /^hari$/, start: /^jam mulai/, dur: /^lama/, room: /^ruangan$/ }, ["name", "day"]);
    const hr = header(wsRuang, { name: /^nama ruangan/, floor: /^lantai/, active: /^masih dipakai/ }, ["name"]);
    if (hr) {
      for (const r of body(wsRuang, hr, hs ? hs.row - 1 : Infinity)) {
        const name = clean(cell(wsRuang, r, hr.col.name!));
        if (name) add("Ruangan", r, { name, floor: cell(wsRuang, r, hr.col.floor ?? 0), active: cell(wsRuang, r, hr.col.active ?? 0) });
      }
    }
    if (hs) {
      let any = false;
      for (const r of body(wsRuang, hs)) {
        const name = clean(cell(wsRuang, r, hs.col.name!));
        if (!name) continue;
        any = true;
        add("TemplateAcara", r, { name, pattern: "Mingguan", day: cell(wsRuang, r, hs.col.day!), start: cell(wsRuang, r, hs.col.start ?? 0), dur: cell(wsRuang, r, hs.col.dur ?? 0), room: clean(cell(wsRuang, r, hs.col.room ?? 0)) });
      }
      if (any) notes.push("Ibadah rutin di tab 7 diimpor sebagai template Mingguan tanpa posisi pelayanan. Atur posisinya (dan pola Bulanan bila perlu) di Template acara.");
    }
  }

  return { rows, found, notes };
}
