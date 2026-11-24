"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import { inputCls } from "@/components/jadwal/api";
import { stickyCard, stickyPage } from "@/components/ui/sticky";
import { MONTHS, monthRange } from "@/lib/ui";
import { yearOptions } from "@/lib/yearOptions";

/**
 * Baris filter seragam untuk semua daftar. Yang paling sering dipakai langsung terlihat (children);
 * sisanya disembunyikan di "Filter lainnya" (more) yang bisa dibuka-tutup, dengan angka bila ada yang sedang aktif.
 * `moreCount` = jumlah filter tersembunyi yang sedang dipakai; panel otomatis terbuka bila sudah ada yang aktif.
 *
 * Aturan tampilan yang sama di semua halaman: semua kotak setinggi 44px dengan label di atasnya; urutan Cari, lalu bulan dan tahun (FMonth),
 * lalu kotak pilihan; kotak pilihan selebar 192px (w-48) kecuali isinya sangat panjang, bulan 144px dan tahun 112px; di HP dua kotak berbagi satu baris; tombol nyala/mati lewat FToggles; "Atur ulang" paling akhir.
 * Menempel saat digulir: di layar lebar seluruh baris, di HP hanya kotak cari (filter lain ikut tergulir agar layar tidak habis).
 */
export function FilterBar({ children, more, moreCount = 0, mobileExtraCount = 0, active, onReset, lead, surface = "page", sticky = true }: {
  children: ReactNode; more?: ReactNode; moreCount?: number; active?: boolean; onReset?: () => void;
  /** Filter yang hanya berpindah ke "Filter lainnya" di HP (mis. tanggal): ikut dihitung pada angka di HP saja. */
  mobileExtraCount?: number;
  /** Baris tambahan di atas filter (mis. pilihan waktu): di layar lebar ikut menempel, di HP ikut tergulir. */
  lead?: ReactNode;
  /** "card" bila bar berada di dalam kartu putih. */
  surface?: "page" | "card";
  /** Menempel di bawah header saat digulir. Matikan hanya bila bar berada di dalam dialog. */
  sticky?: boolean;
}) {
  const [open, setOpen] = useState(moreCount > 0);
  // Kotak cari (bila anak pertama adalah FSearch) dipisahkan dari filter lain: di HP hanya kotak cari yang menempel, filter lain ikut tergulir
  // supaya layar tidak habis. Di layar lebar semuanya satu baris yang menempel. Filter lain dirender dua kali (satu per ukuran layar; yang tidak dipakai disembunyikan CSS).
  const kids = Children.toArray(children);
  const first = kids[0];
  const hasSearch = isValidElement(first) && first.type === FSearch;
  const search = hasSearch ? first : null;
  const rest = hasSearch ? kids.slice(1) : kids;

  const moreBtn = more ? (
    <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
      className={`flex h-11 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-bold ${open ? ON : moreCount > 0 ? ON : mobileExtraCount > 0 ? `${OFF} max-md:border-[var(--primary)] max-md:bg-[var(--primary-soft)] max-md:text-[var(--primary-ink)]` : OFF}`}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
      Filter lainnya
      {moreCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-[var(--primary)] text-[11px] font-extrabold text-white max-md:hidden">{moreCount}</span>}
      {moreCount + mobileExtraCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-[var(--primary)] text-[11px] font-extrabold text-white md:hidden">{moreCount + mobileExtraCount}</span>}
      <span aria-hidden="true" className={`text-[11px] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
    </button>
  ) : null;
  const resetBtn = onReset && active ? (
    <button type="button" onClick={onReset} className="h-11 rounded-xl px-3 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Atur ulang</button>
  ) : null;
  const morePanel = more && open ? <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5">{more}</div> : null;
  const hasRest = rest.length > 0 || !!moreBtn || !!resetBtn;

  return (
    <>
      {lead && search && <div className="md:hidden">{lead}</div>}
      <div className={`flex flex-col gap-3 ${sticky ? (surface === "card" ? stickyCard : stickyPage) : ""} ${search ? "" : "max-md:hidden"}`} role="search">
        {lead && <div className={search ? "max-md:hidden" : ""}>{lead}</div>}
        <div className="flex flex-wrap items-end gap-3">
          {search}
          <div className="contents max-md:hidden">{rest}{moreBtn}{resetBtn}</div>
        </div>
        {morePanel && <div className="max-md:hidden">{morePanel}</div>}
      </div>
      {/* HP: filter selain kotak cari, tidak menempel */}
      <div className={`flex flex-col gap-3 md:hidden ${search ? "max-md:-mt-3" : ""}`}>
        {!search && lead}
        {hasRest && <div className="flex flex-wrap items-end gap-3">{rest}{moreBtn}{resetBtn}</div>}
        {morePanel}
      </div>
    </>
  );
}

const lbl = "flex flex-col gap-1.5 text-[13px] font-bold";
const ON = "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-ink)]";
const OFF = "border-[var(--line)] bg-white text-[var(--ink-2)] hover:bg-[#f3f4f9]";

export type Opt = { value: string; label: string };

export function FSelect({ label, value, onChange, options, allLabel = "Semua", children, width = "w-48" }: {
  label: string; value: string; onChange: (v: string) => void; options?: Opt[]; allLabel?: string; children?: ReactNode; width?: string;
}) {
  return (
    <label className={`${lbl} max-md:min-w-0 max-md:flex-1 max-md:basis-[calc(50%-6px)]`}>{label}
      <select className={`${inputCls} ${width} max-md:w-full`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        {children}
      </select>
    </label>
  );
}

/**
 * Filter periode per bulan (pengganti "Dari – Sampai"): dua kotak pendek berdampingan, Bulan dan Tahun. Menghasilkan tanggal 1 sampai
 * tanggal terakhir bulan itu lewat `onRange`, jadi API yang memakai `from` dan `to` tidak berubah.
 * Tahun: hanya tahun yang punya data (`years`, dari server), ditambah tahun yang sedang dipilih.
 */
export function FMonth({ from, onRange, years }: { from: string; onRange: (from: string, to: string) => void; years?: number[] }) {
  const y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const yearList = yearOptions(years, y);
  const set = (yy: number, mm: number) => { const r = monthRange(`${yy}-${String(mm).padStart(2, "0")}-01`); onRange(r.from, r.to); };
  return (
    <div className="flex gap-2 max-md:basis-full">
      <label className={`${lbl} max-md:min-w-0 max-md:flex-1`}>Bulan
        <select className={`${inputCls} w-36 max-md:w-full`} value={m} onChange={(e) => set(y, Number(e.target.value))}>
          {MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
        </select>
      </label>
      <label className={`${lbl} max-md:min-w-0 max-md:flex-1`}>Tahun
        <select className={`${inputCls} w-28 max-md:w-full`} value={y} onChange={(e) => set(Number(e.target.value), m)}>
          {yearList.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
    </div>
  );
}

/** Kelompok tombol nyala/mati berlabel (mis. "Tampilkan": Rapat, Acara batal), tingginya sama dengan kotak isian lain. */
export function FToggles({ label, children }: { label: string; children: ReactNode }) {
  return <div role="group" aria-label={label} className={lbl}>{label}<div className="flex flex-wrap gap-2">{children}</div></div>;
}
export function FToggle({ on, onClick, color, children, title, danger = false }: { on: boolean; onClick: () => void; color?: string; children: ReactNode; title?: string; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={title}
      className={`flex h-11 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-[13px] font-bold ${on ? (danger ? "border-[#E8B4B4] bg-[#FDECEC] text-[#9B1C1C]" : ON) : OFF}`}>
      {color && <span className="size-[9px] flex-none rounded-full" style={{ background: color, opacity: on ? 1 : 0.35 }} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function FNumber({ label, value, onChange, min = 0, max = 120, placeholder }: { label: string; value: string; onChange: (v: string) => void; min?: number; max?: number; placeholder?: string }) {
  return <label className={lbl}>{label}<input type="number" inputMode="numeric" min={min} max={max} className={`${inputCls} w-24`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></label>;
}

export function FSearch({ label = "Cari", value, onChange, placeholder, width = "min-w-56 flex-1" }: { label?: string; value: string; onChange: (v: string) => void; placeholder: string; width?: string }) {
  return (
    <label className={`${lbl} ${width}`}>{label}
      <span className="relative block">
        <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-2)]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${inputCls} pl-10`} />
      </span>
    </label>
  );
}

/** Kartu pembungkus tabel/daftar: isinya diikuti <Pager /> di dasar kartu. */
export const listCard = "overflow-hidden rounded-[20px] border border-[var(--line)] bg-white";
export const Alert = ({ children }: { children: ReactNode }) => (
  <p role="alert" className="rounded-xl border border-[#F2C9C9] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#9B1C1C]">{children}</p>
);
