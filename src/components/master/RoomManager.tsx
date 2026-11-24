"use client";

import { useEffect, useRef, useState } from "react";
import { askConfirm } from "@/components/ui/Confirm";
import Switch from "@/components/jadwal/Switch";
import { btnGhost, btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";
import { Alert, FilterBar, FSearch, FSelect, listCard } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import { useDebounced, usePagedList } from "@/components/ui/usePagedList";
import { floorText } from "@/lib/ui";
import Modal, { confirmDiscard, Field } from "./Modal";
import { CompactList, CompactRow, Detail, useOpenRows } from "@/components/ui/CompactList";

export type RoomRow = { id: string; name: string; floor: number | null; isActive: boolean; upcoming: number };
type Options = { floors: number[]; hasNoFloor: boolean };

/** Dialog ruangan baru / ubah ruangan: kode ruangan dan lantainya. */
export function RoomDialog({ room, onClose, onSaved }: { room: RoomRow | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(room?.name ?? "");
  const [floor, setFloor] = useState(room && room.floor !== null ? String(room.floor) : "");
  const [touched, setTouched] = useState(!!room);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sig = JSON.stringify([name, floor]);
  const [initialSig] = useState(sig);
  const dirty = sig !== initialSig;
  const cancel = async () => { if (await confirmDiscard(dirty)) onClose(); };

  // kode seperti 401A / 301B: angka pertama = lantai (hanya mengisi bila lantai belum disentuh)
  function onName(v: string) {
    setName(v);
    const m = /^([1-9])\d{2}[A-Za-z]?$/.exec(v.trim());
    if (!touched && m) setFloor(m[1]!);
  }

  async function save() {
    if (!name.trim()) return setError("Nama ruangan wajib diisi.");
    const f = floor.trim() === "" ? null : Number(floor);
    if (f !== null && (!Number.isInteger(f) || f < -5 || f > 99)) return setError("Lantai berupa angka bulat, mis. 4.");
    setBusy(true); setError("");
    const body = { name: name.trim(), floor: f, ...(room ? { isActive: room.isActive } : {}) };
    const r = room ? await callApi("PATCH", `/api/v1/lookups/rooms/${room.id}`, body) : await callApi("POST", "/api/v1/lookups/rooms", body);
    setBusy(false);
    if (r.ok) onSaved(); else setError(errMsg(r.data));
  }

  return (
    <Modal title={room ? "Ubah ruangan" : "Ruangan baru"} onClose={onClose} dirty={dirty} footer={
      <>
        <button type="button" className={btnGhost} onClick={() => void cancel()}>Batal</button>
        <button type="button" className={btnPrimary} disabled={busy} onClick={save}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </>
    }>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Field label="Nama ruangan"><input className={inputCls} value={name} onChange={(e) => onName(e.target.value)} maxLength={80} autoFocus placeholder="Mis. 401A" /></Field>
        <Field label="Lantai" hint="Mis. 4 untuk ruangan 401A. Boleh dikosongkan; 0 = lantai dasar, angka minus = basement.">
          <input className={inputCls} type="number" inputMode="numeric" min={-5} max={99} value={floor} onChange={(e) => { setFloor(e.target.value); setTouched(true); }} placeholder="Mis. 4" />
        </Field>
        {error && <p className="text-sm font-semibold text-[#9B1C1C]" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}

/** Daftar ruangan berhalaman dengan filter cari / lantai / status. Mengubah hanya untuk yang berhak kelola master. */
export default function RoomManager({ canManage, version, onChange }: { canManage: boolean; version: number; onChange: () => void }) {
  const [q, setQ] = useState("");
  const [floor, setFloor] = useState("");
  const [status, setStatus] = useState("");
  const [edit, setEdit] = useState<RoomRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rows = useOpenRows();
  const search = useDebounced(q.trim());
  const list = usePagedList<RoomRow, { options: Options }>("/api/v1/rooms", { search, floor, status });
  const first = useRef(true);
  // ruangan baru dibuat dari papan di atas: muat ulang daftar tanpa kembali ke halaman 1
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (first.current) { first.current = false; return; } list.reload(); }, [version]);
  const opts = list.data?.options;
  const dirty = !!(q || floor || status);

  async function call(method: string, url: string, body?: unknown) {
    setBusy(true); setError("");
    const r = await callApi(method, url, body);
    setBusy(false);
    if (!r.ok) { setError(errMsg(r.data)); return; }
    list.reload(); onChange();
  }
  const toggle = (r: RoomRow, v: boolean) => call("PATCH", `/api/v1/lookups/rooms/${r.id}`, { name: r.name, isActive: v });
  const remove = async (r: RoomRow) => { if (await askConfirm(`Hapus ruangan "${r.name}"?`)) void call("DELETE", `/api/v1/lookups/rooms/${r.id}`); };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium text-[var(--ink-2)]">Ruangan yang nonaktif tidak muncul saat membuat jadwal baru, tetapi jadwal lama tetap utuh. Satu ruangan tidak bisa dipakai dua acara pada jam yang beririsan.</p>
      <FilterBar active={dirty} onReset={() => { setQ(""); setFloor(""); setStatus(""); }} moreCount={status ? 1 : 0}
        more={<FSelect label="Status" value={status} onChange={setStatus} allLabel="Semua status" options={[{ value: "ACTIVE", label: "Aktif" }, { value: "INACTIVE", label: "Nonaktif" }]} />}>
        <FSearch label="Cari ruangan" value={q} onChange={setQ} placeholder="Kode ruangan, mis. 401A" />
        <FSelect label="Lantai" value={floor} onChange={setFloor} allLabel="Semua lantai">
          {opts?.floors.map((f) => <option key={f} value={f}>{floorText(f)}</option>)}
          {opts?.hasNoFloor && <option value="NONE">Belum diisi</option>}
        </FSelect>
      </FilterBar>
      {(error || list.error) && <Alert>{error || list.error}</Alert>}

      <div className={listCard} aria-busy={list.loading}>
        {/* HP: daftar ringkas */}
        {list.items === null && <p className="px-4 py-8 text-center text-sm text-[var(--ink-2)] md:hidden">Memuat…</p>}
        {list.items?.length === 0 && <p className="px-4 py-8 text-center text-sm font-semibold text-[var(--ink-2)] md:hidden">{dirty ? "Tidak ada ruangan yang cocok dengan filter ini." : "Belum ada ruangan."}</p>}
        {!!list.items?.length && (
          <CompactList label="Daftar ruangan">
            {list.items.map((r) => (
              <CompactRow key={r.id} id={r.id} open={rows.open.has(r.id)} onToggle={rows.toggle} expandable={canManage}
                title={<span className={r.isActive ? "" : "text-[#8B90AA]"}>{r.name}</span>}
                sub={[r.floor === null ? null : floorText(r.floor), r.upcoming === 0 ? "Kosong" : `${r.upcoming} pemakaian`].filter(Boolean).join(" · ")}
                trailing={<span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${r.isActive ? "bg-[#E3F4E8] text-[#1B6B34]" : "bg-[#ECEEF4] text-[#565B76]"}`}>{r.isActive ? "Aktif" : "Nonaktif"}</span>}>
                <Detail label="Ruangan aktif"><Switch checked={r.isActive} onChange={(v) => void toggle(r, v)} label={`Ruangan ${r.name} aktif`} disabled={busy} /></Detail>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEdit(r)} className="h-9 rounded-xl border border-[var(--line)] bg-white px-3.5 text-[13px] font-bold text-[var(--primary-ink)]">Ubah</button>
                  <button type="button" onClick={() => remove(r)} className="h-9 rounded-xl px-3.5 text-[13px] font-bold text-[#9B1C1C] hover:bg-[#FFF5F5]">Hapus</button>
                </div>
              </CompactRow>
            ))}
          </CompactList>
        )}
        <div className="overflow-x-auto max-md:hidden">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs font-bold uppercase tracking-[0.06em] text-[var(--ink-2)]">
              <tr><th className="px-4 py-3">Ruangan</th><th className="px-4 py-3">Lantai</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Pemakaian mendatang</th>{canManage && <th className="px-4 py-3" />}</tr>
            </thead>
            <tbody>
              {list.items === null && <tr><td colSpan={5} className="px-4 py-8 text-center text-[var(--ink-2)]">Memuat…</td></tr>}
              {list.items?.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center font-semibold text-[var(--ink-2)]">{dirty ? "Tidak ada ruangan yang cocok dengan filter ini." : `Belum ada ruangan.${canManage ? " Tambahkan lewat tombol “Ruangan baru”." : ""}`}</td></tr>}
              {list.items?.map((r) => (
                <tr key={r.id} className="border-t border-[var(--line-2)] hover:bg-[#FAFAFD]">
                  <td className={`px-4 py-3 text-[15px] font-bold ${r.isActive ? "" : "text-[#8B90AA]"}`}>{r.name}</td>
                  <td className="px-4 py-3 font-semibold">{r.floor === null ? <span className="text-[var(--ink-2)]">–</span> : floorText(r.floor)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 text-xs font-bold text-[var(--ink-2)]">
                      {canManage && <Switch checked={r.isActive} onChange={(v) => void toggle(r, v)} label={`Ruangan ${r.name} aktif`} disabled={busy} />}
                      {r.isActive ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold">{r.upcoming === 0 ? <span className="text-[var(--ink-2)]">Kosong</span> : `${r.upcoming} pemakaian`}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => setEdit(r)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Ubah</button>
                      <button type="button" onClick={() => remove(r)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#9B1C1C] hover:bg-[#FFF5F5]">Hapus</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} noun="ruangan" />
      </div>
      {edit && <RoomDialog room={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); onChange(); }} />}
    </div>
  );
}
