"use client";

import { useState, type ReactNode } from "react";
import { inputCls } from "@/components/jadwal/api";
import { stickyCard, stickyPage } from "@/components/ui/sticky";

/**
 * Baris filter seragam untuk semua daftar. Yang paling sering dipakai langsung terlihat (children);
 * sisanya disembunyikan di "Filter lainnya" (more) yang bisa dibuka-tutup, dengan angka bila ada yang sedang aktif.
 * `moreCount` = jumlah filter tersembunyi yang sedang dipakai; panel otomatis terbuka bila sudah ada yang aktif.
 */
export function FilterBar({ children, more, moreCount = 0, mobileExtraCount = 0, active, onReset, lead, surface = "page", sticky = true }: {
  children: ReactNode; more?: ReactNode; moreCount?: number; active?: boolean; onReset?: () => void;
  /** Filter yang hanya berpindah ke "Filter lainnya" di HP (mis. tanggal): ikut dihitung pada angka di HP saja. */
  mobileExtraCount?: number;
  /** Baris tambahan di atas filter yang ikut menempel (mis. pilihan waktu atau tanggal). */
  lead?: ReactNode;
  /** "card" bila bar berada di dalam kartu putih. */
  surface?: "page" | "card";
  /** Selalu menempel di bawah header saat digulir. Matikan hanya bila bar berada di dalam dialog. */
  sticky?: boolean;
}) {
  const [open, setOpen] = useState(moreCount > 0);
  return (
    <div className={`flex flex-col gap-3 ${sticky ? (surface === "card" ? stickyCard : stickyPage) : ""}`} role="search">
      {lead}
      <div className="flex flex-wrap items-end gap-3">
        {children}
        {more && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className={`flex h-11 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-bold ${open ? ON : moreCount > 0 ? ON : mobileExtraCount > 0 ? `${OFF} max-md:border-[var(--primary)] max-md:bg-[var(--primary-soft)] max-md:text-[var(--primary-ink)]` : OFF}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
            Filter lainnya
            {moreCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-[var(--primary)] text-[11px] font-extrabold text-white max-md:hidden">{moreCount}</span>}
            {moreCount + mobileExtraCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-[var(--primary)] text-[11px] font-extrabold text-white md:hidden">{moreCount + mobileExtraCount}</span>}
            <span aria-hidden="true" className={`text-[11px] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
          </button>
        )}
        {onReset && active && (
          <button type="button" onClick={onReset} className="h-11 rounded-xl px-3 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Atur ulang</button>
        )}
      </div>
      {more && open && <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5">{more}</div>}
    </div>
  );
}

const lbl = "flex flex-col gap-1.5 text-[13px] font-bold";
const ON = "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-ink)]";
const OFF = "border-[var(--line)] bg-white text-[var(--ink-2)] hover:bg-[#f3f4f9]";

export type Opt = { value: string; label: string };

export function FSelect({ label, value, onChange, options, allLabel = "Semua", children, width = "w-44" }: {
  label: string; value: string; onChange: (v: string) => void; options?: Opt[]; allLabel?: string; children?: ReactNode; width?: string;
}) {
  return (
    <label className={lbl}>{label}
      <select className={`${inputCls} ${width}`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        {children}
      </select>
    </label>
  );
}

export function FDate({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return <label className={`${lbl} max-md:min-w-0 max-md:flex-1 ${className}`}>{label}<input type="date" className={`${inputCls} w-44 max-md:w-full`} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

/**
 * Pasangan "Dari – Sampai". Pakai dua kali dalam satu FilterBar: where="main" (terlihat di layar lebar, disembunyikan di HP)
 * di children, dan where="more" (hanya di HP) di dalam `more`, supaya bagian atas HP tidak penuh.
 */
export function FDateRange({ from, to, onFrom, onTo, where, fromLabel = "Dari", toLabel = "Sampai" }: {
  from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void; where: "main" | "more"; fromLabel?: string; toLabel?: string;
}) {
  const cls = where === "main" ? "max-md:hidden" : "md:hidden";
  return (
    <>
      <FDate label={fromLabel} value={from} onChange={onFrom} className={cls} />
      <FDate label={toLabel} value={to} onChange={onTo} className={cls} />
    </>
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
