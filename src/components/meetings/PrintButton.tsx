"use client";

import Link from "next/link";

/** Bilah alat di atas lembar cetak. Tidak ikut tercetak. */
export default function PrintToolbar({ backHref, version }: { backHref: string; version: number }) {
  return (
    <div className="print:hidden sticky top-0 z-10 border-b border-[var(--line)] bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[860px] flex-wrap items-center justify-between gap-3 px-6 py-3">
        <Link href={backHref} className="text-[13px] font-bold text-[var(--primary-ink)] hover:underline">← Kembali ke notulen</Link>
        <span className="flex flex-wrap items-center gap-3">
          <span className="text-[12.5px] font-semibold text-[var(--ink-2)]">Versi Final {version}. Pilih “Simpan sebagai PDF” di jendela cetak untuk menyimpan berkas.</span>
          <button type="button" onClick={() => window.print()} className="flex h-11 items-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:brightness-110">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v6H7z" /></svg>
            Cetak / simpan PDF
          </button>
        </span>
      </div>
    </div>
  );
}
