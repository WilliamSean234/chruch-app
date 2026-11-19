"use client";

import { useEffect, useRef } from "react";

export type SavedAction = { label: string; onClick: () => void; primary?: boolean };

/** Dialog "berhasil disimpan" dengan pilihan ke mana setelah ini. Esc atau klik area gelap menutupnya (tetap di halaman). */
export default function SavedDialog({ title, message, actions, onClose }: { title: string; message?: string; actions: SavedAction[]; onClose: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const primaryIdx = actions.findIndex((a) => a.primary);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#171a2c]/45 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="saved-title"
        className="flex w-full max-w-[440px] flex-col gap-5 rounded-[22px] border border-[var(--line)] bg-white p-6 shadow-[0_24px_60px_-20px_rgba(30,34,90,0.5)]">
        <div className="flex items-start gap-4">
          <span className="grid size-11 flex-none place-items-center rounded-full bg-[#E3F3E7] text-[#1B6B34]" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 id="saved-title" className="m-0 text-[17px] font-extrabold leading-snug">{title}</h2>
            {message && <p className="m-0 text-sm font-medium leading-relaxed text-[var(--ink-2)]">{message}</p>}
            <p className="m-0 text-sm font-semibold text-[var(--ink)]">Mau ke mana sekarang?</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2.5">
          {actions.map((a, i) => (
            <button key={a.label} ref={i === (primaryIdx >= 0 ? primaryIdx : 0) ? first : undefined} type="button" onClick={a.onClick}
              className={a.primary ? "h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:brightness-110" : "h-11 rounded-xl border border-[var(--line)] bg-white px-5 text-sm font-bold hover:bg-[var(--bg)]"}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
