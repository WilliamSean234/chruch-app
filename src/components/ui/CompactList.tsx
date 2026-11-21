"use client";

import { useCallback, useState } from "react";

/**
 * Pola daftar ringkas untuk layar HP, pengganti tabel lebar yang harus digeser ke samping.
 * Dipakai berdampingan dengan tabelnya: tabel diberi `max-md:hidden`, daftar ini diberi `md:hidden`.
 * Satu baris tertutup hanya memuat judul + satu baris keterangan; sisanya muncul saat baris dibuka.
 */

/** Daftar id baris yang sedang terbuka. Bawaan tertutup semua. */
export function useOpenRows() {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = useCallback((id: string) => setOpen((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  const openAll = useCallback((ids: string[]) => setOpen(new Set(ids)), []);
  const closeAll = useCallback(() => setOpen(new Set()), []);
  return { open, toggle, openAll, closeAll };
}

/** Pembungkus daftar: garis tipis antar baris, tanpa kartu tebal. */
export function CompactList({ children, label }: { children: React.ReactNode; label?: string }) {
  return <ul aria-label={label} className="flex flex-col md:hidden">{children}</ul>;
}

export function CompactRow({ id, open, onToggle, lead, title, sub, trailing, tone, expandable = true, children }: {
  id: string;
  open: boolean;
  onToggle: (id: string) => void;
  /** Penanda kecil di kiri (avatar, nomor, tanggal). */
  lead?: React.ReactNode;
  title: React.ReactNode;
  /** Keterangan satu baris di bawah judul; dipotong bila kepanjangan. */
  sub?: React.ReactNode;
  /** Status singkat di kanan (chip). */
  trailing?: React.ReactNode;
  /** Warna latar baris, mis. untuk acara dibatalkan. */
  tone?: string;
  /** false = tidak ada isi untuk dibuka: baris statis tanpa panah. */
  expandable?: boolean;
  /** Isi yang muncul saat baris dibuka: chip, rincian, dan tombol aksi. */
  children?: React.ReactNode;
}) {
  const panel = `${id}-panel`;
  const head = (
    <>
      {lead && <span className="flex-none">{lead}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{title}</span>
        {sub && <span className="mt-0.5 block truncate text-xs font-medium text-[var(--ink-2)]">{sub}</span>}
      </span>
      {trailing && <span className="flex-none">{trailing}</span>}
    </>
  );
  return (
    <li className={`border-b border-[var(--line-2)] last:border-b-0 ${tone ?? ""}`}>
      {expandable ? (
        <button type="button" onClick={() => onToggle(id)} aria-expanded={open} aria-controls={panel}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-[var(--bg)]">
          {head}
          <span aria-hidden="true" className={`flex-none text-[10px] text-[var(--ink-2)] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        </button>
      ) : (
        <div className="flex w-full items-center gap-3 px-3 py-2.5">{head}</div>
      )}
      {expandable && open && (
        <div id={panel} className="flex flex-col gap-2.5 px-3 pb-3 pl-3">
          {children}
        </div>
      )}
    </li>
  );
}

/** Satu pasang "label: nilai" di dalam baris yang dibuka. */
export function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[13px]">
      <span className="flex-none text-[var(--ink-2)]">{label}</span>
      <span className="min-w-0 text-right font-semibold">{children}</span>
    </div>
  );
}
