"use client";

import { useEffect, useState } from "react";
import type { AudienceValue } from "@/lib/audienceForm";

/** Acara khusus komunitas (mis. Fellowship untuk Pemuda): anggota komunitas yang dipilih melihatnya di Jadwal saya. */
export default function AudienceFields({ value, onChange, disabled }: { value: AudienceValue; onChange: (v: AudienceValue) => void; disabled?: boolean }) {
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!value.on || communities.length) return;
    let live = true;
    fetch("/api/v1/lookups/communities", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d) setCommunities(d.items); });
    return () => { live = false; };
  }, [value.on, communities.length]);
  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-white px-3.5 py-3">
        <input type="checkbox" className="mt-0.5 size-5 flex-none" checked={value.on} disabled={disabled} onChange={(e) => onChange({ on: e.target.checked, ids: e.target.checked ? value.ids : [] })} />
        <span className="flex flex-col gap-0.5 text-sm">
          <span className="font-bold">Khusus komunitas tertentu</span>
          <span className="text-[13px] font-medium text-[var(--ink-2)]">Semua anggota komunitas yang dipilih melihat acara ini di Jadwal saya, tanpa perlu ditugaskan. Acara tetap tampil di kalender seperti biasa.</span>
        </span>
      </label>
      {value.on && (
        <div className="flex flex-wrap gap-2 rounded-xl bg-[#f3f4fb] p-3.5" role="group" aria-label="Komunitas">
          {communities.map((c) => {
            const on = value.ids.includes(c.id);
            return (
              <button key={c.id} type="button" disabled={disabled} aria-pressed={on}
                onClick={() => onChange({ on: true, ids: on ? value.ids.filter((x) => x !== c.id) : [...value.ids, c.id] })}
                className={`h-9 rounded-full border px-3.5 text-[13px] font-bold ${on ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-ink)]" : "border-[var(--line)] bg-white text-[var(--ink-2)]"}`}>{on ? "✓ " : ""}{c.name}</button>
            );
          })}
          {!communities.length && <span className="text-[13px] font-medium text-[var(--ink-2)]">Memuat komunitas…</span>}
        </div>
      )}
    </div>
  );
}
