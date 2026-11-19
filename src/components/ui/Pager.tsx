"use client";

import { PAGE_SIZES } from "@/lib/paging";

/** Nomor halaman dengan elipsis: 1 … 4 5 6 … 12 */
function windowOf(page: number, pages: number): (number | "…")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) { set.add(2); set.add(3); set.add(4); }
  if (page >= pages - 2) { set.add(pages - 1); set.add(pages - 2); set.add(pages - 3); }
  const nums = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => { if (i > 0 && n - nums[i - 1]! > 1) out.push("…"); out.push(n); });
  return out;
}

const btn = "grid h-9 min-w-9 place-items-center rounded-lg px-2.5 text-[13px] font-bold disabled:cursor-not-allowed disabled:opacity-40";

/** Penomoran halaman seragam: ringkasan "1–25 dari 120", pilihan jumlah per halaman, dan tombol halaman. */
export default function Pager({ page, pageSize, total, onPage, onPageSize, noun = "data", className = "" }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize: (n: number) => void; noun?: string; className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const sizes = (PAGE_SIZES as readonly number[]).includes(pageSize) ? [...PAGE_SIZES] : [...PAGE_SIZES, pageSize].sort((a, b) => a - b);
  return (
    <nav aria-label="Halaman" className={`flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line-2)] px-4 py-3 text-[13px] font-semibold text-[var(--ink-2)] ${className}`}>
      <span aria-live="polite">{total === 0 ? `Tidak ada ${noun}` : `Menampilkan ${from}–${to} dari ${total} ${noun}`}</span>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2">
          Per halaman
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-9 rounded-lg border border-[var(--line)] bg-white px-2 text-[13px] font-bold text-[var(--ink)]">
            {sizes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button type="button" className={`${btn} text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]`} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Halaman sebelumnya">‹</button>
          {windowOf(page, pages).map((n, i) =>
            n === "…" ? <span key={`e${i}`} className="px-1" aria-hidden="true">…</span> : (
              <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}
                className={`${btn} ${n === page ? "bg-[var(--primary)] text-white" : "text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]"}`}>{n}</button>
            ))}
          <button type="button" className={`${btn} text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]`} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Halaman berikutnya">›</button>
        </div>
      </div>
    </nav>
  );
}
