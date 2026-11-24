"use client";

import { useEffect, useRef, useState } from "react";

export type PersonLite = { id: string; name: string };

/** Pencarian orang (untuk filter). Mengetik nama → saran muncul; pilih satu. */
export default function PersonFilter({ value, onChange, label = "Pelayan", placeholder = "Cari nama…" }: { value: PersonLite | null; onChange: (p: PersonLite | null) => void; label?: string; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PersonLite[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const r = await fetch(`/api/v1/persons?limit=8${q ? `&search=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" });
      if (r.ok) setItems(((await r.json()).items as PersonLite[]).map((p) => ({ id: p.id, name: p.name })));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const lbl = "flex flex-col gap-1.5 text-[13px] font-bold max-md:min-w-0 max-md:flex-1 max-md:basis-[calc(50%-6px)]";
  if (value) {
    return (
      <div className={lbl}>{label}
        <span className="flex h-11 w-48 items-center gap-2 rounded-xl border border-[var(--primary)] bg-[var(--primary-soft)] pl-3.5 pr-1.5 text-sm font-bold text-[var(--primary-ink)] max-md:w-full">
          <span className="min-w-0 flex-1 truncate">{value.name}</span>
          <button type="button" onClick={() => onChange(null)} className="grid size-8 flex-none place-items-center rounded-lg hover:bg-white/70" aria-label="Hapus filter orang">✕</button>
        </span>
      </div>
    );
  }
  return (
    <div ref={box} className={`relative ${lbl}`}>{label}
      <span className="relative block">
        <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-2)]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input
          value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          placeholder={placeholder} aria-label="Cari orang"
          className="h-11 w-48 rounded-xl border border-[var(--line)] bg-white pl-10 pr-3.5 text-sm font-semibold placeholder:font-medium placeholder:text-[var(--ink-2)] max-md:w-full"
        />
      </span>
      {open && items.length > 0 && (
        <ul className="absolute left-0 top-full z-20 mt-1 max-h-64 w-64 overflow-auto rounded-xl border border-[var(--line)] bg-white p-1.5 shadow-lg">
          {items.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onChange(p); setOpen(false); setQ(""); }} className="w-full rounded-lg px-3 py-2 text-left text-[13.5px] font-semibold hover:bg-[#ecedf8]">{p.name}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
