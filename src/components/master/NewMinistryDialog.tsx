"use client";

import { useState } from "react";
import Modal, { Field } from "./Modal";
import { btnGhost, btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";

type Team = { id: string; name: string };

/**
 * Tambah pelayanan baru yang belum ada di daftar (mis. posisi EBM baru). Bila pilihan tim lebih dari satu, tim dipilih dulu.
 * Server membatasi: Superadmin untuk semua tim, Admin Tim EBM hanya tim EBM miliknya.
 */
export default function NewMinistryDialog({ teams, onClose, onCreated }: { teams: Team[]; onClose: () => void; onCreated: (ministry: { id: string; name: string }) => void | Promise<void> }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!name.trim() || !teamId) return;
    setBusy(true); setErr("");
    const r = await callApi("POST", "/api/v1/ministries", { teamTypeId: teamId, name: name.trim() });
    if (!r.ok) { setBusy(false); setErr(errMsg(r.data)); return; }
    await onCreated({ id: r.data.id as string, name: r.data.name as string });
    setBusy(false);
  };

  return (
    <Modal title="Pelayanan baru" onClose={onClose} dirty={!!name.trim()}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Batal</button>
        <button type="button" onClick={save} disabled={busy || !name.trim()} className={btnPrimary}>{busy ? "Menyimpan…" : "Tambahkan"}</button>
      </>}>
      <div className="flex flex-col gap-4">
        {teams.length > 1 && (
          <Field label="Tim"><select className={inputCls} value={teamId} onChange={(e) => setTeamId(e.target.value)}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        )}
        <Field label={teams.length === 1 ? `Nama pelayanan di ${teams[0]!.name}` : "Nama pelayanan"}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Mis. Drone, Streaming" className={inputCls} autoFocus onKeyDown={(e) => { if (e.key === "Enter") void save(); }} />
        </Field>
        <p className="text-xs font-medium leading-relaxed text-[var(--ink-2)]">Pelayanan baru masuk ke daftar tim dan bisa langsung dipakai. Pastikan namanya belum ada di daftar.</p>
        {err && <p role="alert" className="rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-sm font-semibold text-[#a12b2b]">{err}</p>}
      </div>
    </Modal>
  );
}
