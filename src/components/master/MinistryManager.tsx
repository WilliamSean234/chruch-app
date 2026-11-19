"use client";

import { useCallback, useEffect, useState } from "react";
import { askConfirm } from "@/components/ui/Confirm";
import Modal from "./Modal";
import Switch from "@/components/jadwal/Switch";
import { btnGhost, btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";

type Min = { id: string; name: string; rehearsalRequiredDefault: boolean };
type Team = { id: string; name: string; isCore: boolean; ministries: Min[] };

/** Kelola tim dan posisi pelayanan (Keyboard, Drum, Angklung, …) beserta bawaan wajib latihannya. */
export default function MinistryManager({ onClose, onChange }: { onClose: () => void; onChange: () => void }) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newTeam, setNewTeam] = useState("");
  const [adding, setAdding] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<{ kind: "team" | "min"; id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    const r = await callApi("GET", "/api/v1/teams");
    if (r.ok) setTeams(r.data.items); else setError(errMsg(r.data));
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function call(method: string, url: string, body?: unknown) {
    setBusy(true); setError("");
    const r = await callApi(method, url, body);
    setBusy(false);
    if (!r.ok) { setError(errMsg(r.data)); return false; }
    await load(); onChange();
    return true;
  }

  const addTeam = async () => { if (newTeam.trim() && (await call("POST", "/api/v1/teams", { name: newTeam.trim() }))) setNewTeam(""); };
  const addMin = async (t: Team) => { const n = (adding[t.id] ?? "").trim(); if (n && (await call("POST", "/api/v1/ministries", { teamTypeId: t.id, name: n }))) setAdding({ ...adding, [t.id]: "" }); };
  const saveEdit = async () => {
    if (!edit || !edit.name.trim()) return;
    const ok = edit.kind === "team" ? await call("PATCH", `/api/v1/teams/${edit.id}`, { name: edit.name.trim() }) : await call("PATCH", `/api/v1/ministries/${edit.id}`, { name: edit.name.trim() });
    if (ok) setEdit(null);
  };
  const delTeam = async (t: Team) => { if (await askConfirm(`Hapus tim "${t.name}" beserta semua posisinya?`)) void call("DELETE", `/api/v1/teams/${t.id}`); };
  const delMin = async (m: Min) => { if (await askConfirm(`Hapus posisi "${m.name}"?`)) void call("DELETE", `/api/v1/ministries/${m.id}`); };

  const nameCell = (kind: "team" | "min", id: string, name: string, cls: string) =>
    edit?.kind === kind && edit.id === id ? (
      <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); void saveEdit(); }}>
        <input className={`${inputCls} !h-9`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus maxLength={80} aria-label="Nama" />
        <button className={`${btnPrimary} !h-9 !px-3`} type="submit" disabled={busy}>Simpan</button>
        <button className={`${btnGhost} !h-9 !px-3`} type="button" onClick={() => setEdit(null)}>Batal</button>
      </form>
    ) : <span className={`min-w-0 flex-1 truncate ${cls}`}>{name}</span>;

  return (
    <Modal wide title="Pelayanan" onClose={onClose} footer={<button type="button" className={btnPrimary} onClick={onClose}>Selesai</button>}>
      <div className="flex flex-col gap-5">
        <p className="text-sm font-medium text-[var(--ink-2)]">Tim dan posisi pelayanan yang bisa dipilih untuk setiap orang dan setiap jadwal. Posisi yang masih dipakai jadwal mendatang tidak bisa dihapus.</p>
        {error && <p className="rounded-xl border border-[#F2C9C9] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#9B1C1C]" role="alert">{error}</p>}
        {!teams && !error && <p className="text-sm text-[var(--ink-2)]">Memuat…</p>}
        {teams?.map((t) => (
          <section key={t.id} className="flex flex-col gap-1 rounded-2xl border border-[var(--line)] p-4">
            <div className="flex items-center gap-2 pb-2">
              {nameCell("team", t.id, t.name, "text-[13px] font-extrabold uppercase tracking-[0.07em] text-[var(--gold-ink)]")}
              {!(edit?.kind === "team" && edit.id === t.id) && (
                <span className="flex gap-1">
                  <button type="button" onClick={() => setEdit({ kind: "team", id: t.id, name: t.name })} className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Ubah</button>
                  {!t.isCore && <button type="button" onClick={() => delTeam(t)} className="rounded-lg px-2 py-1 text-xs font-bold text-[#9B1C1C] hover:bg-[#FFF5F5]">Hapus</button>}
                </span>
              )}
            </div>
            {t.ministries.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 border-t border-[var(--line-2)] py-2">
                {nameCell("min", m.id, m.name, "text-sm font-bold")}
                {!(edit?.kind === "min" && edit.id === m.id) && (
                  <>
                    <span className="flex items-center gap-2 text-xs font-bold text-[var(--ink-2)]">Wajib latihan
                      <Switch checked={m.rehearsalRequiredDefault} onChange={(v) => void call("PATCH", `/api/v1/ministries/${m.id}`, { rehearsalRequiredDefault: v })} label={`${m.name} wajib latihan bawaan`} disabled={busy} />
                    </span>
                    <span className="flex gap-1">
                      <button type="button" onClick={() => setEdit({ kind: "min", id: m.id, name: m.name })} className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Ubah</button>
                      <button type="button" onClick={() => delMin(m)} className="rounded-lg px-2 py-1 text-xs font-bold text-[#9B1C1C] hover:bg-[#FFF5F5]">Hapus</button>
                    </span>
                  </>
                )}
              </div>
            ))}
            <form className="flex gap-2 border-t border-[var(--line-2)] pt-3" onSubmit={(e) => { e.preventDefault(); void addMin(t); }}>
              <input className={`${inputCls} !h-10`} value={adding[t.id] ?? ""} onChange={(e) => setAdding({ ...adding, [t.id]: e.target.value })} placeholder="Posisi baru…" aria-label={`Posisi baru untuk ${t.name}`} maxLength={80} />
              <button className={`${btnGhost} !h-10 flex-none`} type="submit" disabled={busy || !(adding[t.id] ?? "").trim()}>＋ Tambah</button>
            </form>
          </section>
        ))}
        <form className="flex gap-2 rounded-2xl border border-dashed border-[#B9BDDA] p-4" onSubmit={(e) => { e.preventDefault(); void addTeam(); }}>
          <input className={inputCls} value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="Tim baru (mis. Tim doa)…" aria-label="Nama tim baru" maxLength={80} />
          <button className={`${btnPrimary} flex-none`} type="submit" disabled={busy || !newTeam.trim()}>＋ Tim baru</button>
        </form>
      </div>
    </Modal>
  );
}
