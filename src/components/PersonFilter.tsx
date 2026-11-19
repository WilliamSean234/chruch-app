"use client";

import { useEffect, useRef, useState } from "react";

export type PersonLite = { id: string; name: string };

/** Pencarian orang (untuk filter). Mengetik nama → saran muncul; pilih satu. */
export default function PersonFilter({ value, onChange, placeholder = "Cari nama pelayan…" }: { value: PersonLite | null; onChange: (p: PersonLite | null) => void; placeholder?: string }) {
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

  if (value) {
    return (
      <span className="flex h-[46px] items-center gap-2 rounded-xl border border-[var(--primary)] bg-[var(--primary-soft)] pl-4 pr-2 text-[13.5px] font-bold text-[var(--primary-ink)]">
        {value.name}
        <button type="button" onClick={() => onChange(null)} className="grid size-7 place-items-center rounded-lg hover:bg-white/70" aria-label="Hapus filter orang">✕</button>
      </span>
    );
  }
  return (
    <div ref={box} className="relative">
      <input
        value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        placeholder={placeholder} aria-label="Cari orang"
        className="h-[46px] w-44 rounded-xl border border-[var(--line)] bg-white px-4 text-[13.5px] font-semibold placeholder:text-[var(--ink-2)]"
      />
      {open && items.length > 0 && (
        <ul className="absolute left-0 top-12 z-20 max-h-64 w-64 overflow-auto rounded-xl border border-[var(--line)] bg-white p-1.5 shadow-lg">
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
