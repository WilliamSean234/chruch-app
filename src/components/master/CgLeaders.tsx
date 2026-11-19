"use client";

import { useEffect, useState } from "react";
import { callApi, errMsg, inputCls } from "@/components/jadwal/api";

export type Leader = { id: string; name: string; title?: string | null };
const label = (p: Leader) => (p.title && !p.name.toLowerCase().startsWith(p.title.toLowerCase()) ? `${p.title} ${p.name}` : p.name);

/** Leader sebuah CG: tampil sebagai chip, bisa ditambah (cari nama) dan dicabut. Satu CG boleh banyak leader. */
export default function CgLeaders({ cgId, leaders, canWrite, onSaved }: { cgId: string; leaders: Leader[]; canWrite: boolean; onSaved: () => void }) {
  const [adding, setAdding] = useState(false);
  const [members, setMembers] = useState<Leader[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Calon leader = anggota CG ini (orang yang kelompok CG-nya CG ini).
  useEffect(() => {
    if (!adding) return;
    let off = false;
    void callApi("GET", `/api/v1/persons?limit=200&cgGroupId=${cgId}`).then((r) => {
      if (off) return;
      if (r.ok) setMembers(r.data.items as Leader[]); else setError(errMsg(r.data));
    });
    return () => { off = true; };
  }, [adding, cgId]);

  async function save(ids: string[]) {
    setBusy(true); setError("");
    const r = await callApi("PUT", `/api/v1/cg-groups/${cgId}/leaders`, { personIds: ids });
    setBusy(false);
    if (!r.ok) return setError(errMsg(r.data));
    setAdding(false); onSaved();
  }

  const options = (members ?? []).filter((p) => !leaders.some((l) => l.id === p.id));

  return (
    <div className="flex basis-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-extrabold uppercase tracking-[0.07em] text-[var(--gold-ink)]">Leader</span>
        {leaders.length === 0 && <span className="text-xs font-medium text-[var(--ink-2)]">Belum ada leader</span>}
        {leaders.map((l) => (
          <span key={l.id} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--primary-soft)] pl-3.5 pr-2 text-[13px] font-bold text-[var(--primary-ink)]">
            {label(l)}
            {canWrite && <button type="button" disabled={busy} aria-label={`Cabut ${l.name} sebagai leader`} onClick={() => void save(leaders.filter((x) => x.id !== l.id).map((x) => x.id))} className="grid size-5 place-items-center rounded-full text-xs hover:bg-white/70">✕</button>}
          </span>
        ))}
        {canWrite && !adding && <button type="button" onClick={() => { setError(""); setMembers(null); setAdding(true); }} className="h-8 rounded-full border border-dashed border-[#B9BDDA] px-3.5 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[#f3f4fb]">＋ leader</button>}
      </div>
      {adding && (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
          {!members && !error && <span className="text-sm text-[var(--ink-2)]">Memuat anggota…</span>}
          {members && options.length === 0 && (
            <span className="flex-1 text-sm font-medium text-[var(--ink-2)]">
              {members.length === 0 ? "Belum ada anggota di CG ini. Atur CG di data orang dulu." : "Semua anggota CG ini sudah jadi leader."}
            </span>
          )}
          {members && options.length > 0 && (
            <select autoFocus disabled={busy} defaultValue="" aria-label="Pilih leader dari anggota CG" className={`${inputCls} !h-10 flex-1`}
              onChange={(e) => e.target.value && void save([...leaders.map((x) => x.id), e.target.value])}>
              <option value="">Pilih anggota CG…</option>
              {options.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}
            </select>
          )}
          <button type="button" onClick={() => setAdding(false)} className="rounded-xl px-3 text-xs font-bold text-[var(--ink-2)] hover:bg-white">Tutup</button>
        </div>
      )}
      {error && <p className="text-sm font-semibold text-[#9B1C1C]" role="alert">{error}</p>}
    </div>
  );
}
