"use client";

import { useCallback, useEffect, useState } from "react";
import { askConfirm } from "@/components/ui/Confirm";
import Switch from "@/components/jadwal/Switch";
import CgLeaders, { type Leader } from "./CgLeaders";
import { btnGhost, btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";

type Row = { id: string; name: string; isActive?: boolean; leaders?: Leader[] };
export type LookupKind = "rooms" | "positions" | "cg-groups" | "communities";

/** Daftar pilihan sederhana yang bisa ditambah/diubah/dihapus: ruangan, posisi di gereja, CG, komunitas. */
export default function LookupManager({ kind, singular, hint, canWrite = true, addOnly = false, onChange }: { kind: LookupKind; singular: string; hint?: string; canWrite?: boolean; /** hanya boleh menambah yang baru: tanpa ubah, hapus, dan pemimpin CG */ addOnly?: boolean; onChange?: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const withActive = kind === "rooms";
  const canEdit = canWrite && !addOnly;

  const load = useCallback(async () => {
    const r = await callApi("GET", `/api/v1/lookups/${kind}`);
    if (r.ok) setRows((r.data.items as Row[]).sort((a, b) => a.name.localeCompare(b.name))); else setError(errMsg(r.data));
  }, [kind]);
  useEffect(() => { void load(); }, [load]);

  async function call(method: string, url: string, body?: unknown) {
    setBusy(true); setError("");
    const r = await callApi(method, url, body);
    setBusy(false);
    if (!r.ok) { setError(errMsg(r.data)); return false; }
    await load();
    onChange?.();
    return true;
  }

  const add = async () => { if (name.trim() && (await call("POST", `/api/v1/lookups/${kind}`, { name: name.trim() }))) setName(""); };
  const rename = async (r: Row) => { if (editName.trim() && (await call("PATCH", `/api/v1/lookups/${kind}/${r.id}`, { name: editName.trim(), isActive: r.isActive }))) setEditId(null); };
  const toggle = (r: Row, v: boolean) => call("PATCH", `/api/v1/lookups/${kind}/${r.id}`, { name: r.name, isActive: v });
  const remove = async (r: Row) => { if (await askConfirm(`Hapus ${singular.toLowerCase()} "${r.name}"?`)) void call("DELETE", `/api/v1/lookups/${kind}/${r.id}`); };

  return (
    <div className="flex flex-col gap-4">
      {hint && <p className="text-sm font-medium text-[var(--ink-2)]">{hint}</p>}
      {error && <p className="rounded-xl border border-[#F2C9C9] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#9B1C1C]" role="alert">{error}</p>}
      {canWrite && (
        <form className="flex gap-2.5" onSubmit={(e) => { e.preventDefault(); void add(); }}>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={`${singular} baru…`} aria-label={`Nama ${singular.toLowerCase()} baru`} maxLength={80} />
          <button className={`${btnPrimary} flex-none`} disabled={busy || !name.trim()} type="submit">＋ Tambah</button>
        </form>
      )}
      {!rows && !error && <p className="text-sm text-[var(--ink-2)]">Memuat…</p>}
      {rows && rows.length === 0 && <p className="rounded-xl border border-dashed border-[#B9BDDA] p-5 text-center text-sm font-semibold text-[var(--ink-2)]">Belum ada {singular.toLowerCase()}.</p>}
      {rows && rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--line-2)] rounded-2xl border border-[var(--line)] bg-white">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              {editId === r.id ? (
                <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); void rename(r); }}>
                  <input className={`${inputCls} !h-10`} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus maxLength={80} aria-label="Nama" />
                  <button className={`${btnPrimary} !h-10`} disabled={busy} type="submit">Simpan</button>
                  <button className={`${btnGhost} !h-10`} type="button" onClick={() => setEditId(null)}>Batal</button>
                </form>
              ) : (
                <>
                  <span className={`min-w-0 flex-1 truncate text-[15px] font-bold ${withActive && r.isActive === false ? "text-[#8B90AA]" : ""}`}>{r.name}</span>
                  {withActive && (
                    <span className="flex items-center gap-2 text-xs font-bold text-[var(--ink-2)]">
                      {r.isActive === false ? "Nonaktif" : "Aktif"}
                      <Switch checked={r.isActive !== false} onChange={(v) => void toggle(r, v)} label={`Ruangan ${r.name} aktif`} disabled={busy || !canEdit} />
                    </span>
                  )}
                  {canEdit && (
                    <span className="flex gap-1">
                      <button type="button" onClick={() => { setEditId(r.id); setEditName(r.name); }} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Ubah</button>
                      <button type="button" onClick={() => remove(r)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#9B1C1C] hover:bg-[#FFF5F5]">Hapus</button>
                    </span>
                  )}
                </>
              )}
              {kind === "cg-groups" && editId !== r.id && <CgLeaders cgId={r.id} leaders={r.leaders ?? []} canWrite={canEdit} onSaved={() => { void load(); onChange?.(); }} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
