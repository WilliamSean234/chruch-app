"use client";

import { useEffect } from "react";

/** Dialog bergulir untuk formulir. Ditutup lewat tombol atau Esc (klik di luar tidak menutup, supaya isian tidak hilang). */
export default function Modal({ title, onClose, footer, wide, children }: {
  title: string; onClose: () => void; footer?: React.ReactNode; wide?: boolean; children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#171a2c]/40 p-4 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[22px] border border-[var(--line)] bg-white shadow-[0_24px_60px_-20px_rgba(30,34,90,0.45)] ${wide ? "max-w-3xl" : "max-w-xl"}`}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-6 py-4">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Tutup" className="grid size-9 place-items-center rounded-lg text-[var(--ink-2)] hover:bg-[var(--bg)]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--line)] bg-[var(--surface-2)] px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="flex flex-col gap-1.5 text-[13px] font-bold">
    {label}
    {children}
    {hint && <span className="text-xs font-medium text-[var(--ink-2)]">{hint}</span>}
  </label>
);
