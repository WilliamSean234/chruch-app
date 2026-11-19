/**
 * Menggambar notulen Final menjadi gambar PNG (tanpa pustaka tambahan) supaya mudah dibagikan lewat WhatsApp.
 * Huruf besar dan kontras tinggi agar tetap terbaca di HP lama. Notulen panjang dipecah menjadi beberapa halaman gambar.
 * Hanya dipanggil dari browser (memakai canvas).
 */
export type NotulenImageData = {
  church: string; group: string; topic: string; dateText: string; timeText: string; room: string; number: string; version: number;
  attendanceSummary: string | null; present: string[]; excused: string[]; absent: string[]; guests: string[];
  agenda: string; discussion: string; decisions: string; finalizedText: string;
};

const W = 1080;
const PAD = 64;
const MAX_H = 1800;
const FOOT = 92;
const C = { ink: "#171A2C", muted: "#565B76", gold: "#8A6119", indigo: "#3037A8", rule: "#E2DCC6", green: "#1B6B34", amber: "#6F4304", red: "#9B1C1C" };

type Item = { text: string; weight: number; size: number; color: string; lh: number; before?: number; after?: number; italic?: boolean; rule?: boolean; keep?: boolean };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r/g, "").split("\n")) {
    if (!para.trim()) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line) out.push(line);
      if (ctx.measureText(word).width <= maxW) { line = word; continue; }
      // kata yang lebih panjang dari satu baris dipotong per huruf
      line = "";
      for (const ch of word) {
        if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch;
      }
    }
    out.push(line);
  }
  return out;
}

export async function renderNotulenPages(d: NotulenImageData): Promise<Blob[]> {
  const family = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
  try { await Promise.all([400, 600, 700, 800].map((w) => document.fonts.load(`${w} 32px ${family}`))); await document.fonts.ready; } catch { /* pakai huruf cadangan */ }

  const measure = document.createElement("canvas").getContext("2d")!;
  const font = (it: Pick<Item, "weight" | "size" | "italic">) => `${it.italic ? "italic " : ""}${it.weight} ${it.size}px ${family}`;
  const maxW = W - PAD * 2;

  const items: Item[] = [];
  const para = (text: string, o: Partial<Item> = {}) => {
    const base: Item = { text: "", weight: 500, size: 32, color: C.ink, lh: 50, ...o };
    measure.font = font(base);
    const lines = wrap(measure, text, maxW);
    lines.forEach((t, i) => items.push({ ...base, text: t, before: i === 0 ? o.before : 0, after: i === lines.length - 1 ? o.after : 0 }));
  };
  const heading = (text: string, color = C.gold) => {
    items.push({ text, weight: 800, size: 27, color, lh: 36, before: 38, keep: true });
    items.push({ text: "", weight: 500, size: 10, color: C.rule, lh: 10, rule: true, after: 8 });
  };

  // kepala dokumen
  para(d.church, { weight: 800, size: 30, color: C.indigo, lh: 42, before: 8 });
  para("NOTULEN RAPAT", { weight: 800, size: 27, color: C.muted, lh: 36, before: 4 });
  para(d.group, { weight: 800, size: 56, lh: 68, before: 4 });
  para(d.topic, { weight: 700, size: 36, lh: 50, before: 6, color: C.indigo });
  para(d.dateText, { weight: 600, size: 30, lh: 44, before: 14, color: C.muted });
  para(`${d.timeText} · ${d.room}`, { weight: 600, size: 30, lh: 44, color: C.muted });
  para(`No. ${d.number} · Versi ${d.version} (Final)`, { weight: 600, size: 26, lh: 40, color: C.muted, after: 4 });

  if (d.attendanceSummary) {
    heading("DAFTAR HADIR");
    para(d.attendanceSummary, { weight: 800, size: 32, lh: 48, after: 6 });
    const group = (label: string, names: string[], color: string) => {
      if (!names.length) return;
      para(`${label} (${names.length})`, { weight: 800, size: 28, color, lh: 42, before: 8, keep: true });
      para(names.join(", "), { size: 30, lh: 46 });
    };
    group("Hadir", d.present, C.green); group("Izin", d.excused, C.amber); group("Tidak hadir", d.absent, C.red); group("Tamu", d.guests, C.muted);
  }
  for (const [title, text] of [["AGENDA", d.agenda], ["PEMBAHASAN DAN TINDAK LANJUT", d.discussion], ["KEPUTUSAN", d.decisions]] as const) {
    heading(title);
    if (text.trim()) para(text.trim(), { size: 32, lh: 50 }); else para("Tidak ada.", { italic: true, color: C.muted });
  }
  para(d.finalizedText, { weight: 600, size: 24, lh: 36, color: C.muted, before: 40 });

  // bagi menjadi halaman
  const top = 16 + PAD;
  const contTop = top + 84; // halaman lanjutan punya judul kecil
  const limit = MAX_H - FOOT;
  const hOf = (it: Item) => (it.before ?? 0) + it.lh + (it.after ?? 0);
  const pages: Item[][] = [[]];
  let y = top;
  items.forEach((it, i) => {
    let h = hOf(it);
    if (it.keep) h += hOf(items[i + 1] ?? it) + hOf(items[i + 2] ?? it);
    const cur = pages[pages.length - 1];
    if (cur.length > 0 && y + h > limit) { pages.push([]); y = contTop; }
    const dest = pages[pages.length - 1];
    // baris kosong di awal halaman tidak perlu
    if (dest.length === 0 && it.text === "" && !it.rule) return;
    dest.push(it); y += hOf(it);
  });

  const total = pages.length;
  const blobs: Blob[] = [];
  for (let p = 0; p < total; p++) {
    const list = pages[p];
    const bodyH = list.reduce((s, it) => s + hOf(it), 0);
    const height = Math.max(1080, Math.ceil((p === 0 ? top : contTop) + bodyH + FOOT));
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, height);
    ctx.fillStyle = C.indigo; ctx.fillRect(0, 0, W, 16);
    ctx.textBaseline = "alphabetic";

    let yy = p === 0 ? top : contTop;
    if (p > 0) {
      ctx.fillStyle = C.muted; ctx.font = `800 26px ${family}`;
      ctx.fillText(`NOTULEN RAPAT · ${d.group.toUpperCase()} (lanjutan)`, PAD, top + 30);
    }
    for (const it of list) {
      yy += it.before ?? 0;
      if (it.rule) {
        ctx.fillStyle = it.color; ctx.fillRect(PAD, yy - 4, W - PAD * 2, 3);
      } else if (it.text) {
        ctx.fillStyle = it.color; ctx.font = font(it);
        ctx.fillText(it.text, PAD, yy + Math.round(it.lh * 0.72));
      }
      yy += it.lh + (it.after ?? 0);
    }
    // kaki halaman
    ctx.fillStyle = C.rule; ctx.fillRect(PAD, height - FOOT + 10, W - PAD * 2, 2);
    ctx.fillStyle = C.muted; ctx.font = `600 24px ${family}`;
    ctx.fillText(`Tertutup, hanya untuk anggota ${d.group}`, PAD, height - FOOT + 52);
    const label = `Halaman ${p + 1} dari ${total}`;
    ctx.fillText(label, W - PAD - ctx.measureText(label).width, height - FOOT + 52);

    blobs.push(await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Gagal membuat gambar."))), "image/png")));
  }
  return blobs;
}

export const imageFileName = (group: string, dateIso: string, page: number, total: number) =>
  `notulen-${group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${dateIso.slice(0, 10)}${total > 1 ? `-hal${page}` : ""}.png`;
