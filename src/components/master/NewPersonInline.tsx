"use client";

import { useEffect, useState } from "react";
import { callApi, errMsg, inputCls, btnPrimary, btnGhost } from "@/components/jadwal/api";

export type CreatedPerson = { id: string; name: string; title: string | null };
type Dup = { id: string; name: string; birthDate: string | null; position: string };

/** Formulir "Orang baru" yang dipakai seragam di semua tempat (pemilih posisi, dialog anggota kelompok, dst.). */
export default function NewPersonInline({ ministry, initialName, onCancel, onCreated }: {
  /** Bila diisi, orang baru otomatis tercatat bisa melayani di pelayanan ini. */
  ministry?: { id: string; name: string }; initialName: string; onCancel: () => void; onCreated: (p: CreatedPerson) => void;
}) {
  const [name, setName] = useState(initialName);
  const [gender, setGender] = useState<"L" | "P" | "">("");
  const [positions, setPositions] = useState<{ id: string; name: string }[]>([]);
  const [positionId, setPositionId] = useState("");
  const [origin, setOrigin] = useState<"DALAM" | "LUAR">("DALAM");
  const [church, setChurch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dups, setDups] = useState<Dup[]>([]);

  useEffect(() => {
    void callApi("GET", "/api/v1/lookups/positions").then((r) => {
      if (!r.ok) return;
      const items = r.data.items as { id: string; name: string }[];
      setPositions(items);
      setPositionId((items.find((p) => p.name === "Jemaat") ?? items[0])?.id ?? "");
    });
  }, []);

  async function save(confirmDuplicate = false) {
    if (!name.trim()) return setError("Nama wajib diisi.");
    if (!gender) return setError("Pilih jenis kelamin.");
    if (origin === "LUAR" && !church.trim()) return setError("Isi gereja asal untuk orang dari luar.");
    setBusy(true); setError(""); setDups([]);
    const r = await callApi("POST", "/api/v1/persons", {
      name: name.trim(), gender, positionId, origin, originChurch: origin === "LUAR" ? church.trim() : null,
      ministryIds: ministry ? [ministry.id] : [], confirmDuplicate: confirmDuplicate || undefined,
    });
    setBusy(false);
    if (r.ok) return onCreated({ id: r.data.id, name: r.data.name, title: r.data.title ?? null });
    if (r.data?.error?.code === "DUPLICATE_PERSON") setDups(r.data.error.details?.matches ?? []);
    setError(errMsg(r.data));
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#D0D3E8] bg-white p-3.5">
      <span className="text-sm font-extrabold">Orang baru</span>
      <label className="flex flex-col gap-1 text-xs font-bold text-[var(--ink-2)]">Nama
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-bold text-[var(--ink-2)]">Jenis kelamin
          <select className={inputCls} value={gender} onChange={(e) => setGender(e.target.value as "L" | "P" | "")}>
            <option value="">Pilih…</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-[var(--ink-2)]">Posisi di gereja
          <select className={inputCls} value={positionId} onChange={(e) => setPositionId(e.target.value)}>
            {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-bold text-[var(--ink-2)]">Asal
          <select className={inputCls} value={origin} onChange={(e) => setOrigin(e.target.value as "DALAM" | "LUAR")}>
            <option value="DALAM">Jemaat dalam</option><option value="LUAR">Dari luar</option>
          </select>
        </label>
        {origin === "LUAR" && (
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--ink-2)]">Gereja asal
            <input className={inputCls} value={church} onChange={(e) => setChurch(e.target.value)} />
          </label>
        )}
      </div>
      <p className="text-xs font-medium text-[var(--ink-2)]">{ministry ? `Otomatis tercatat bisa melayani sebagai ${ministry.name}. ` : ""}Data lain (tanggal lahir, CG, komunitas) bisa dilengkapi nanti di menu Orang.</p>
      {error && <p className="text-sm font-semibold text-[#9B1C1C]" role="alert">{error}</p>}
      {dups.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {dups.map((m) => (
            <button key={m.id} type="button" onClick={() => onCreated({ id: m.id, name: m.name, title: null })} className="flex items-center justify-between rounded-lg border border-[var(--line)] px-3 py-2 text-left text-sm hover:bg-[var(--bg)]">
              <span><b>{m.name}</b> <span className="text-xs text-[var(--ink-2)]">· {m.position}{m.birthDate ? ` · lahir ${m.birthDate}` : ""}</span></span>
              <span className="text-xs font-bold text-[var(--primary)]">Pakai ini</span>
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => save(true)} className="h-10 rounded-xl border border-[#EAD9AE] bg-[#FFFBF0] text-sm font-bold text-[#6F4304] hover:bg-[#FFF5DC]">Bukan mereka, tetap buat orang baru</button>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" className={`${btnPrimary} flex-1`} disabled={busy} onClick={() => save()}>{busy ? "Menyimpan…" : "Simpan & pilih"}</button>
        <button type="button" className={btnGhost} onClick={onCancel}>Batal</button>
      </div>
    </div>
  );
}
