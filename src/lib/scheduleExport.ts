/**
 * Mengubah data jadwal tim menjadi gambar (PNG), PDF, dan teks WhatsApp. Hanya dipanggil dari browser, tanpa pustaka tambahan.
 */
import type { ExportModel } from "./teamSchedule";
import { penWeight } from "./penatalayan";

type Month = ExportModel["months"][number];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const FULL = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const NOTE = "Tanda \"A / B\": petugas Ibadah Minggu I dan II berbeda (I / II).";

/** Indeks kolom pertama tiap kelompok (KU1, KU2); kosong bila formatnya tidak berkelompok. */
const groupStarts = (m: ExportModel) => (m.groups ?? []).map((g) => ({ g, i0: m.columns.findIndex((c) => c.key === g.keys[0]), n: g.keys.length }));
/** Garis tegak di baris header hanya di batas kelompok; kolom di dalam kelompok bersatu seperti sel gabungan. */
const headerEdge = (m: ExportModel, i: number) => !m.groups || i === 0 || i === m.columns.length || groupStarts(m).some((x) => x.i0 === i);

/** Lebar kolom: sama rata, kecuali Penatalayan (Padus dan Tema lebih lebar, Band/No Band lebih sempit). `x` berisi n+1 batas kolom. */
function geometry(m: ExportModel, total: number) {
  const ws = m.columns.map((c) => (m.pen ? penWeight(c.key) : 1));
  const unit = total / ws.reduce((a, b) => a + b, 0);
  const w = ws.map((v) => v * unit);
  const x = [0];
  for (const v of w) x.push(x[x.length - 1]! + v);
  return { w, x };
}
const isTextCol = (k: string) => k === "@padus" || k === "@theme";
/** Penatalayan: judul kelompok di baris atas, nama kolom di baris bawah; kolom tunggal (Liturgos, PIC, Padus, Tema) menempati dua baris. */
const penGroups = (m: ExportModel) => (m.groups ?? []).map((g) => ({ g, i0: m.columns.findIndex((c) => c.key === g.keys[0]), n: g.keys.length, single: !!g.single }));
const oneLine = (t: string) => t.replace(/\s*\n\s*/g, " – ");

// ───────── teks ─────────

export function toText(m: ExportModel): string {
  const out: string[] = [`*${m.title} ${m.year}*`];
  for (const mo of m.months) {
    out.push("", `*${mo.name}*`);
    for (const r of mo.rows) {
      out.push(`${r.day} ${SHORT[mo.month - 1]}`);
      if (m.multi && m.groups) {
        for (const g of m.groups) {
          const parts = g.keys.filter((k) => r.cells[k]).map((k) => `${m.columns.find((c) => c.key === k)!.label} ${oneLine(r.cells[k]!)}`);
          if (parts.length) out.push(`- ${g.label}: ${parts.join(", ")}`);
        }
      } else if (m.pen && m.groups) {
        for (const g of m.groups) {
          if (g.keys.includes("@band")) {
            const parts = g.keys.filter((k) => k !== "@band" && r.cells[k]).map((k) => `${m.columns.find((c) => c.key === k)!.label} ${r.cells[k]}`);
            const band = r.cells["@band"];
            if (parts.length || band) out.push(`- ${g.label}${band ? ` (${band})` : ""}${parts.length ? `: ${parts.join(", ")}` : ""}`);
            continue;
          }
          const names = g.keys.map((k) => r.cells[k]).filter(Boolean).map(oneLine);
          if (names.length) out.push(`- ${g.label}: ${names.join(", ")}`);
        }
      } else if (m.groups) {
        for (const g of m.groups) { const names = g.keys.map((k) => r.cells[k]).filter(Boolean); if (names.length) out.push(`- ${g.label}: ${names.join(", ")}`); }
      } else {
        for (const c of m.columns) if (r.cells[c.key]) out.push(`- ${c.label}: ${r.cells[c.key]}`);
      }
      if (!m.columns.some((c) => r.cells[c.key] && (!m.pen || c.key !== "@band"))) out.push("- (belum diisi)");
    }
  }
  if (m.hasDiff) out.push("", `_${NOTE}_`);
  return out.join("\n");
}

// ───────── PNG ─────────

const C = { ink: "#171A2C", muted: "#565B76", indigo: "#3037A8", gold: "#F3E9CF", line: "#B9BCE0", zebra: "#F6F7FC", diff: "#FFF4D6" };

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight: number, family: string) {
  let s = size;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 15) { s -= 1; ctx.font = `${weight} ${s}px ${family}`; }
  return s;
}
function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

const PER_IMAGE = 4; // jumlah bulan dalam satu gambar
const APP_NAME = "Penjadwalan Elyon App";
const today = () => { const d = new Date(); return `${d.getDate()} ${FULL[d.getMonth()]} ${d.getFullYear()}`; };
const footerText = (page: number, pages: number) => `Dibuat dengan ${APP_NAME} · ${today()} · Halaman ${page}/${pages}`;

async function drawPage(m: ExportModel, mos: Month[], page: number, pages: number): Promise<Blob> {
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  try { await Promise.all([600, 700, 800].map((w) => document.fonts.load(`${w} 28px ${family}`))); await document.fonts.ready; } catch { /* huruf cadangan */ }

  const pen = !!(m.pen && m.groups);
  const W = m.multi ? Math.max(2200, 44 * 2 + 100 + m.columns.length * 150) : pen ? 2200 : 1600, PAD = 44, dateW = pen ? 100 : 130, rowH = 60, headH = pen ? 100 : 84, bandH = 54, gap = 30, titleH = 130, footH = 70;
  const geo = geometry(m, W - PAD * 2 - dateW);
  const colX = (i: number) => PAD + dateW + geo.x[i]!;
  const noteH = m.hasDiff ? 34 : 0;

  // tinggi tiap baris: Penatalayan memungkinkan Tema/Padus/nama panjang turun ke baris berikutnya
  const meas = document.createElement("canvas").getContext("2d")!;
  const LINE = 29, MAXL = 6;
  const wrapCell = (t: string, w: number): { lines: string[]; size: number } => {
    if (!pen) return { lines: [t], size: 0 };
    const size = 24;
    meas.font = `600 ${size}px ${family}`;
    const lines: string[] = [];
    for (const para of t.split("\n")) { if (!para.trim()) continue; lines.push(...wrapWords(meas, para.trim(), w - 18)); }
    if (lines.length > MAXL) { lines.length = MAXL; lines[MAXL - 1] = `${lines[MAXL - 1]!.replace(/\s+\S*$/, "")}…`; }
    return { lines: lines.length ? lines : [""], size };
  };
  const heights = mos.map((mo) => mo.rows.map((r) => {
    if (!pen) return rowH;
    let n = 1;
    m.columns.forEach((c, i) => { const t = r.cells[c.key]; if (t) n = Math.max(n, wrapCell(t, geo.w[i]!).lines.length); });
    return Math.max(rowH, n * LINE + 22);
  }));
  const H = titleH + mos.reduce((n, mo, mi) => n + bandH + headH + heights[mi]!.reduce((a, b) => a + b, 0) + gap, 0) + noteH + footH;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "middle"; ctx.textAlign = "center";

  // judul halaman
  ctx.fillStyle = C.indigo; ctx.fillRect(PAD, 30, W - PAD * 2, 84);
  ctx.fillStyle = "#FFFFFF"; ctx.font = `800 40px ${family}`;
  ctx.fillText(`${m.title} ${m.year}`, W / 2, 62);
  const period = mos.length > 1 ? `${mos[0]!.name} – ${mos[mos.length - 1]!.name}` : mos[0]!.name;
  ctx.font = `700 24px ${family}`; ctx.fillText(period, W / 2, 98);

  let y = titleH;
  for (const [mi, mo] of mos.entries()) {
    const top = y;
    ctx.fillStyle = "#4B52C4"; ctx.fillRect(PAD, y, W - PAD * 2, bandH);
    ctx.fillStyle = "#FFFFFF"; ctx.font = `800 28px ${family}`; ctx.textAlign = "center";
    ctx.fillText(mo.name, W / 2, y + bandH / 2);
    y += bandH;

    ctx.fillStyle = C.gold; ctx.fillRect(PAD, y, W - PAD * 2, headH);
    ctx.fillStyle = C.ink; ctx.font = `800 26px ${family}`;
    ctx.fillText("TGL", PAD + dateW / 2, y + headH / 2);
    if (pen) {
      for (const x of penGroups(m)) {
        const cx = (colX(x.i0) + colX(x.i0 + x.n)) / 2;
        ctx.font = `800 26px ${family}`;
        if (x.single) { ctx.fillText(x.g.label, cx, y + headH / 2); continue; }
        ctx.fillText(x.g.label, cx, y + headH / 4);
        for (let k = 0; k < x.n; k++) {
          const c = m.columns[x.i0 + k]!;
          ctx.font = `700 21px ${family}`;
          const lines = wrapWords(ctx, c.label, geo.w[x.i0 + k]! - 10);
          lines.forEach((l, li) => ctx.fillText(l, (colX(x.i0 + k) + colX(x.i0 + k + 1)) / 2, y + (headH * 3) / 4 + (li - (lines.length - 1) / 2) * 23));
        }
      }
    } else if (m.groups) {
      ctx.font = `800 28px ${family}`;
      for (const x of groupStarts(m)) ctx.fillText(x.g.label, colX(x.i0) + (geo.x[x.i0 + x.n]! - geo.x[x.i0]!) / 2, y + headH / 2);
    } else {
      m.columns.forEach((c, i) => {
        ctx.font = `800 24px ${family}`;
        const lines = wrapWords(ctx, c.label, geo.w[i]! - 16);
        lines.forEach((l, k) => ctx.fillText(l, colX(i) + geo.w[i]! / 2, y + headH / 2 + (k - (lines.length - 1) / 2) * 30));
      });
    }
    y += headH;

    const ys = [y];
    mo.rows.forEach((r, ri) => {
      const rh = heights[mi]![ri]!;
      if (ri % 2 === 1) { ctx.fillStyle = C.zebra; ctx.fillRect(PAD, y, W - PAD * 2, rh); }
      ctx.fillStyle = C.ink; ctx.font = `800 30px ${family}`; ctx.textAlign = "center";
      ctx.fillText(String(r.day), PAD + dateW / 2, y + rh / 2);
      m.columns.forEach((c, i) => {
        const t = r.cells[c.key] ?? "";
        if (!t) return;
        const x = colX(i), w = geo.w[i]!;
        if (t.includes(" / ")) { ctx.fillStyle = C.diff; ctx.fillRect(x + 1, y + 1, w - 2, rh - 2); }
        ctx.fillStyle = C.ink;
        if (pen) {
          const { lines, size } = wrapCell(t, w);
          ctx.font = `600 ${size}px ${family}`;
          const left = isTextCol(c.key);
          ctx.textAlign = left ? "left" : "center";
          lines.forEach((l, k) => ctx.fillText(l, left ? x + 10 : x + w / 2, y + rh / 2 + (k - (lines.length - 1) / 2) * LINE));
          ctx.textAlign = "center";
        } else {
          fit(ctx, t, w - 16, 27, 600, family);
          ctx.fillText(t, x + w / 2, y + rh / 2);
        }
      });
      y += rh;
      ys.push(y);
    });

    // garis tabel bulan ini
    const bottom = y, head = top + bandH;
    ctx.strokeStyle = C.line; ctx.lineWidth = 2;
    ctx.strokeRect(PAD, top, W - PAD * 2, bottom - top);
    const line = (x1: number, y1: number, x2: number, y2: number) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    if (pen) {
      const gs = penGroups(m);
      const mid = head + headH / 2;
      for (let i = 0; i <= m.columns.length; i++) {
        const x = colX(i);
        const startOrEnd = gs.some((g) => g.i0 === i || g.i0 + g.n === i);
        const inside = gs.some((g) => !g.single && i > g.i0 && i < g.i0 + g.n);
        line(x, startOrEnd ? head : inside ? mid : head + headH, x, bottom);
      }
      for (const g of gs) if (!g.single) line(colX(g.i0), mid, colX(g.i0 + g.n), mid);
    } else {
      for (let i = 0; i <= m.columns.length; i++) { const x = colX(i); line(x, headerEdge(m, i) ? head : head + headH, x, bottom); }
    }
    line(PAD + dateW, head, PAD + dateW, bottom);
    for (const yy of ys) line(PAD, yy, W - PAD, yy);
    line(PAD, head, W - PAD, head);
    y += gap;
  }

  ctx.textAlign = "left"; ctx.fillStyle = C.muted; ctx.font = `600 22px ${family}`;
  if (m.hasDiff) ctx.fillText(NOTE, PAD, y - gap + 30);
  ctx.textAlign = "center"; ctx.font = `600 21px ${family}`;
  ctx.fillText(footerText(page, pages), W / 2, H - footH / 2 + 4);
  return await new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("Gagal membuat gambar."))), "image/png"));
}

/** Beberapa bulan digabung ke satu gambar (maks 4 per gambar), jadi 12 bulan = 3 gambar. */
export async function renderPngs(m: ExportModel): Promise<{ name: string; blob: Blob }[]> {
  const chunks: Month[][] = [];
  for (let i = 0; i < m.months.length; i += PER_IMAGE) chunks.push(m.months.slice(i, i + PER_IMAGE));
  const out: { name: string; blob: Blob }[] = [];
  for (const [i, ch] of chunks.entries()) {
    const span = ch.length > 1 ? `${FULL[ch[0]!.month - 1]!.toLowerCase()}-${FULL[ch[ch.length - 1]!.month - 1]!.toLowerCase()}` : FULL[ch[0]!.month - 1]!.toLowerCase();
    out.push({ name: `jadwal-${m.format}-${m.year}-${span}${chunks.length > 1 ? `-hal${i + 1}dari${chunks.length}` : ""}.png`, blob: await drawPage(m, ch, i + 1, chunks.length) });
  }
  return out;
}

// ───────── PDF (A4 landscape, satu bulan per halaman, huruf Helvetica bawaan PDF) ─────────

const latin = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, "?");
const esc = (s: string) => latin(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
// lebar kira-kira Helvetica (per 1000 em)
const w1 = (ch: string, bold: boolean) => (ch === " " ? 278 : /[ilIjt.,:;'|!]/.test(ch) ? 270 : /[mwMW@]/.test(ch) ? (bold ? 900 : 830) : /[A-Z0-9]/.test(ch) ? (bold ? 700 : 667) : bold ? 580 : 540);
const tw = (s: string, size: number, bold = false) => ([...s].reduce((n, ch) => n + w1(ch, bold), 0) * size) / 1000;

export function buildPdf(m: ExportModel): Blob {
  const PH = 595, M = 36;
  const PW = m.multi ? Math.max(842, M * 2 + 50 + m.columns.length * 58) : 842; // gabungan: halaman melebar mengikuti jumlah kolom
  const pages: string[] = [];
  for (const [pi, mo] of m.months.entries()) {
    const ops: string[] = [];
    const rect = (x: number, y: number, w: number, h: number, fill?: string, stroke?: string) => {
      if (fill) ops.push(`${fill} rg ${x.toFixed(1)} ${(PH - y - h).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
      if (stroke) ops.push(`${stroke} RG 0.7 w ${x.toFixed(1)} ${(PH - y - h).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re S`);
    };
    const text = (s: string, cx: number, cy: number, size: number, bold: boolean, color = "0.09 0.10 0.17", center = true) => {
      const wdt = tw(s, size, bold);
      const x = center ? cx - wdt / 2 : cx;
      ops.push(`BT ${color} rg /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(1)} ${(PH - cy - size * 0.35).toFixed(1)} Td (${esc(s)}) Tj ET`);
    };
    const fitSize = (s: string, maxW: number, size: number, bold: boolean) => { let z = size; while (tw(s, z, bold) > maxW && z > 6) z -= 0.5; return z; };

    rect(M, M, PW - M * 2, 46, "0.19 0.22 0.66");
    text(`${m.title} ${m.year}`, PW / 2, M + 16, 17, true, "1 1 1");
    text(mo.name, PW / 2, M + 35, 12, true, "1 1 1");

    const pen = !!(m.pen && m.groups);
    const top = M + 56, dateW = 50, headH = pen ? 44 : 38;
    const rows = mo.rows.length;
    const avail = PH - top - M - headH - (m.hasDiff ? 16 : 0);
    const rowH = Math.min(pen ? 70 : 46, avail / Math.max(rows, 1));
    const geo = geometry(m, PW - M * 2 - dateW);
    const colX = (i: number) => M + dateW + geo.x[i]!;
    const wrapPdf = (t: string, w: number, size: number, bold: boolean, maxLines: number) => {
      const lines: string[] = [];
      for (const para of t.split("\n")) {
        let cur = "";
        for (const word of para.trim().split(/\s+/).filter(Boolean)) { const x = cur ? `${cur} ${word}` : word; if (tw(x, size, bold) <= w || !cur) cur = x; else { lines.push(cur); cur = word; } }
        if (cur) lines.push(cur);
      }
      if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/\s+\S*$/, "")}...`; }
      return lines;
    };
    rect(M, top, PW - M * 2, headH, "0.95 0.91 0.81");
    text("TGL", M + dateW / 2, top + headH / 2, 10, true);
    if (pen) {
      for (const x of penGroups(m)) {
        const cx = (colX(x.i0) + colX(x.i0 + x.n)) / 2;
        if (x.single) { text(x.g.label, cx, top + headH / 2, 9.5, true); continue; }
        text(x.g.label, cx, top + headH / 4, 9.5, true);
        for (let k = 0; k < x.n; k++) {
          const lines = wrapPdf(m.columns[x.i0 + k]!.label, geo.w[x.i0 + k]! - 4, 7, true, 2);
          lines.forEach((l, li) => text(l, (colX(x.i0 + k) + colX(x.i0 + k + 1)) / 2, top + (headH * 3) / 4 + (li - (lines.length - 1) / 2) * 8, 7, true));
        }
      }
    } else if (m.groups) {
      for (const x of groupStarts(m)) text(x.g.label, colX(x.i0) + (geo.x[x.i0 + x.n]! - geo.x[x.i0]!) / 2, top + headH / 2, 11, true);
    } else {
      m.columns.forEach((c, i) => {
        const lines: string[] = [];
        let cur = "";
        for (const w of c.label.split(" ")) { const t = cur ? `${cur} ${w}` : w; if (tw(t, 9, true) <= geo.w[i]! - 8 || !cur) cur = t; else { lines.push(cur); cur = w; } }
        if (cur) lines.push(cur);
        lines.forEach((l, k) => text(l, colX(i) + geo.w[i]! / 2, top + headH / 2 + (k - (lines.length - 1) / 2) * 11, 9, true));
      });
    }
    mo.rows.forEach((r, ri) => {
      const y = top + headH + ri * rowH;
      if (ri % 2 === 1) rect(M, y, PW - M * 2, rowH, "0.96 0.97 0.99");
      text(String(r.day), M + dateW / 2, y + rowH / 2, 13, true);
      m.columns.forEach((c, i) => {
        const t = r.cells[c.key] ?? "";
        if (!t) return;
        const x = colX(i), w = geo.w[i]!;
        if (t.includes(" / ")) rect(x, y, w, rowH, "1 0.96 0.84");
        if (pen) {
          const size = isTextCol(c.key) ? 7.5 : 8.5;
          const maxLines = Math.max(1, Math.floor((rowH - 4) / (size + 2)));
          const lines = wrapPdf(t, w - 6, size, false, maxLines);
          lines.forEach((l, k) => {
            const cy = y + rowH / 2 + (k - (lines.length - 1) / 2) * (size + 2);
            if (isTextCol(c.key)) text(l, x + 3, cy, size, false, "0.09 0.10 0.17", false); else text(l, x + w / 2, cy, size, false);
          });
        } else text(t, x + w / 2, y + rowH / 2, fitSize(t, w - 8, 11, false), false);
      });
    });
    const bottom = top + headH + rows * rowH;
    rect(M, top, PW - M * 2, bottom - top, undefined, "0.73 0.74 0.88");
    const vline = (x: number, y1: number, y2: number) => ops.push(`0.73 0.74 0.88 RG 0.7 w ${x.toFixed(1)} ${(PH - y1).toFixed(1)} m ${x.toFixed(1)} ${(PH - y2).toFixed(1)} l S`);
    const hline = (x1: number, x2: number, y: number) => ops.push(`0.73 0.74 0.88 RG 0.7 w ${x1.toFixed(1)} ${(PH - y).toFixed(1)} m ${x2.toFixed(1)} ${(PH - y).toFixed(1)} l S`);
    if (pen) {
      const gs = penGroups(m);
      const mid = top + headH / 2;
      for (let i = 0; i <= m.columns.length; i++) {
        const startOrEnd = gs.some((g) => g.i0 === i || g.i0 + g.n === i);
        const inside = gs.some((g) => !g.single && i > g.i0 && i < g.i0 + g.n);
        vline(colX(i), startOrEnd ? top : inside ? mid : top + headH, bottom);
      }
      for (const g of gs) if (!g.single) hline(colX(g.i0), colX(g.i0 + g.n), mid);
    } else {
      for (let i = 0; i <= m.columns.length; i++) vline(colX(i), headerEdge(m, i) ? top : top + headH, bottom);
    }
    vline(M + dateW, top, bottom);
    for (let ri = 0; ri <= rows; ri++) hline(M, PW - M, top + headH + ri * rowH);
    hline(M, PW - M, top + headH);
    if (m.hasDiff) text(NOTE, M, bottom + 12, 8, false, "0.34 0.36 0.46", false);
    text(footerText(pi + 1, m.months.length), PW / 2, PH - 20, 8, false, "0.34 0.36 0.46");
    pages.push(ops.join("\n"));
  }

  // susun objek PDF
  const objs: string[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("PAGES");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids: number[] = [];
  for (const content of pages) {
    const pageNo = objs.length + 1;
    kids.push(pageNo);
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageNo + 1} 0 R >>`);
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(body.length); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  // semua karakter sudah dipaksa < 256, jadi satu karakter = satu byte
  const bytes = new Uint8Array(body.length);
  for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}
