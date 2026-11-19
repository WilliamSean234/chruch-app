"use client";

import { PASSWORD_MIN } from "@/lib/passwordRules";

/** Satu baris syarat: abu-abu sebelum terpenuhi, hijau berikut centang setelah terpenuhi. */
export function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={`flex items-center gap-2 text-[13px] font-semibold transition-colors ${ok ? "text-[#1B6B34]" : "text-[var(--ink-2)]"}`}>
      <span className={`grid size-4 flex-none place-items-center rounded-full transition-colors ${ok ? "bg-[#1B6B34] text-white" : "border border-[#B9BDDA] text-transparent"}`} aria-hidden="true">
        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2l2.4 2.4 4.6-5" /></svg>
      </span>
      {children}
      <span className="sr-only">{ok ? " (terpenuhi)" : " (belum terpenuhi)"}</span>
    </li>
  );
}

/**
 * Panduan membuat kata sandi, dipakai seragam di halaman daftar dan ganti kata sandi.
 * `confirm` diisi bila ada kolom ulangi kata sandi: syarat "kedua isian sama" ikut tampil.
 */
export default function PasswordRules({ value, confirm }: { value: string; confirm?: string }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-live="polite">
      <Rule ok={value.length >= PASSWORD_MIN}>Minimal {PASSWORD_MIN} karakter{value.length > 0 && value.length < PASSWORD_MIN ? ` (${value.length}/${PASSWORD_MIN})` : ""}</Rule>
      {confirm !== undefined && <Rule ok={value.length > 0 && value === confirm}>Kedua isian kata sandi sama</Rule>}
    </ul>
  );
}
