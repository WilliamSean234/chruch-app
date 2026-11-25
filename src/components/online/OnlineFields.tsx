"use client";

import { useEffect, useState } from "react";
import PersonFilter from "@/components/PersonFilter";
import { inputCls } from "@/components/jadwal/api";
import { type OnlineValue } from "@/lib/onlineForm";

export default function OnlineFields({ value, onChange, kind, disabled, hint }: { value: OnlineValue; onChange: (v: OnlineValue) => void; kind: "IBADAH" | "RAPAT"; disabled?: boolean; hint?: string }) {
  const [communities, setCommunities] = useState<{ id: string; name: string }[]>([]);
  const set = (p: Partial<OnlineValue>) => onChange({ ...value, ...p });
  useEffect(() => {
    if (kind !== "IBADAH" || !value.online || communities.length) return;
    let live = true;
    fetch("/api/v1/lookups/communities", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live && d) setCommunities(d.items); });
    return () => { live = false; };
  }, [kind, value.online, communities.length]);

  const lbl = "flex flex-col gap-1.5 text-[13px] font-bold";
  return (
    <div className="flex flex-col gap-3.5 sm:col-span-2">
      <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-white px-3.5 py-3">
        <input type="checkbox" className="mt-0.5 size-5 flex-none" checked={value.online} disabled={disabled} onChange={(e) => set({ online: e.target.checked })} />
        <span className="flex flex-col gap-0.5 text-sm">
          <span className="font-bold">Acara online</span>
          <span className="text-[13px] font-medium text-[var(--ink-2)]">Tanpa ruangan. {kind === "IBADAH" ? "Petugas tetap bisa dijadwalkan." : "Tautan, tema, dan pembicara hanya terlihat oleh anggota kelompok."}</span>
        </span>
      </label>
      {value.online && (
        <div className="grid gap-3.5 rounded-xl bg-[#f3f4fb] p-3.5 sm:grid-cols-2">
          <label className={`${lbl} sm:col-span-2`}>Tautan meeting online
            <input className={inputCls} inputMode="url" maxLength={500} placeholder="mis. https://zoom.us/j/123456789" value={value.url} disabled={disabled} onChange={(e) => set({ url: e.target.value })} />
          </label>
          {kind === "RAPAT" && (
            <label className={`${lbl} sm:col-span-2`}>Tema <span className="font-medium text-[var(--ink-2)]">(opsional)</span>
              <textarea rows={2} maxLength={600} className={`${inputCls} h-auto min-h-[44px] py-2.5`} value={value.theme} disabled={disabled} onChange={(e) => set({ theme: e.target.value })} />
            </label>
          )}
          <div className={`${lbl} sm:col-span-2`}>Pembicara <span className="font-medium text-[var(--ink-2)]">(opsional)</span>
            {value.speaker ? (
              <PersonFilter label="" value={value.speaker} onChange={(p) => set({ speaker: p })} />
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <PersonFilter label="" placeholder="Cari dari daftar orang…" value={null} onChange={(p) => set({ speaker: p, speakerName: "" })} />
                <input className={inputCls} maxLength={120} placeholder="atau ketik nama pembicara luar" value={value.speakerName} disabled={disabled} onChange={(e) => set({ speakerName: e.target.value })} />
              </div>
            )}
          </div>
          {kind === "IBADAH" && (
            <fieldset className="flex flex-col gap-2 sm:col-span-2">
              <legend className="mb-1 text-[13px] font-bold">Siapa yang melihat tautan</legend>
              <label className="flex items-center gap-2.5 text-sm font-semibold"><input type="radio" name="online-aud" checked={value.audience === "ALL"} disabled={disabled} onChange={() => set({ audience: "ALL" })} />Semua orang</label>
              <label className="flex items-center gap-2.5 text-sm font-semibold"><input type="radio" name="online-aud" checked={value.audience === "COMMUNITIES"} disabled={disabled} onChange={() => set({ audience: "COMMUNITIES" })} />Komunitas tertentu saja</label>
              {value.audience === "COMMUNITIES" && (
                <div className="flex flex-wrap gap-2 pl-7">
                  {communities.map((c) => {
                    const on = value.communityIds.includes(c.id);
                    return (
                      <button key={c.id} type="button" disabled={disabled} aria-pressed={on}
                        onClick={() => set({ communityIds: on ? value.communityIds.filter((x) => x !== c.id) : [...value.communityIds, c.id] })}
                        className={`h-9 rounded-full border px-3.5 text-[13px] font-bold ${on ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-ink)]" : "border-[var(--line)] bg-white text-[var(--ink-2)]"}`}>{c.name}</button>
                    );
                  })}
                  {!communities.length && <span className="text-[13px] font-medium text-[var(--ink-2)]">Memuat komunitas…</span>}
                </div>
              )}
              <span className="pl-7 text-xs font-medium text-[var(--ink-2)]">Petugas, pembicara, dan penjadwal acara ini selalu bisa melihat tautan.</span>
            </fieldset>
          )}
          <label className="flex items-start gap-3 rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 sm:col-span-2">
            <input type="checkbox" className="mt-0.5 size-5 flex-none" checked={value.reminder} disabled={disabled} onChange={(e) => set({ reminder: e.target.checked })} />
            <span className="flex flex-col gap-0.5 text-sm">
              <span className="font-bold">Kirim pengingat sehari sebelumnya</span>
              <span className="text-[13px] font-medium text-[var(--ink-2)]">
                {kind === "RAPAT" ? "Sore sebelum rapat, ke anggota kelompok yang diundang."
                  : value.audience === "COMMUNITIES" ? "Sore sebelum acara, ke petugas, pembicara, dan anggota komunitas yang dipilih."
                    : "Sore sebelum acara, ke petugas, pembicara, dan semua orang yang punya akun."}
              </span>
            </span>
          </label>
          {hint && <p className="m-0 text-xs font-medium text-[var(--ink-2)] sm:col-span-2">{hint}</p>}
        </div>
      )}
    </div>
  );
}
