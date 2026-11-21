"use client";

import { useEffect, useState } from "react";

type Kind = "success" | "error";
type Item = { id: number; message: string; kind: Kind };

let push: ((m: string, k: Kind) => void) | null = null;

/** Pemberitahuan singkat di pojok layar, mis. showToast("Perubahan tersimpan"). Hilang sendiri setelah beberapa detik. */
export function showToast(message: string, kind: Kind = "success") { push?.(message, kind); }

/** Pasang sekali di root layout. */
export default function ToastHost() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let n = 0;
    push = (message, kind) => {
      const id = ++n;
      setItems((cur) => [...cur.slice(-2), { id, message, kind }]);
      setTimeout(() => setItems((cur) => cur.filter((x) => x.id !== id)), Math.max(kind === "error" ? 6000 : 3500, message.length * 60));
    };
    return () => { push = null; };
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex max-w-[calc(100vw-2.5rem)] flex-col gap-2.5 max-md:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-md:left-4 max-md:right-4 max-md:max-w-none" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} data-keep role={t.kind === "error" ? "alert" : "status"}
          className="pointer-events-auto flex items-center gap-3 rounded-2xl border bg-white py-3 pl-3.5 pr-4 text-sm font-bold shadow-[0_16px_40px_-16px_rgba(30,34,90,0.5)]"
          style={{ borderColor: t.kind === "error" ? "#F0C7C7" : "#BFE0C7" }}>
          <span className="grid size-7 flex-none place-items-center rounded-full" style={t.kind === "error" ? { background: "#FDF1F1", color: "#9B1C1C" } : { background: "#E3F3E7", color: "#1B6B34" }} aria-hidden="true">
            {t.kind === "error"
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
