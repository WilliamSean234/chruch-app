"use client";

import Fab from "@/components/ui/Fab";
import { useRouter } from "next/navigation";
import { useState } from "react";
import SavedDialog from "@/components/ui/SavedDialog";
import { Field } from "@/components/master/Modal";
import { btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";
import type { ChurchProfile } from "@/lib/church";

const eyebrow = "text-xs font-extrabold tracking-[0.07em] text-[var(--gold-ink)]";

/** Tab "Profil gereja" di Pengaturan. Perubahan baru tersimpan lewat tombol "Simpan perubahan" di atas. */
export default function ChurchProfilePanel({ initial }: { initial: ChurchProfile }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [tagline, setTagline] = useState(initial.tagline);
  const [address, setAddress] = useState(initial.address ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const dirty = name.trim() !== saved.name || tagline.trim() !== saved.tagline || address.trim() !== (saved.address ?? "") || phone.trim() !== (saved.phone ?? "");
  const valid = name.trim().length >= 2;

  async function save() {
    setBusy(true); setError("");
    const r = await callApi("PUT", "/api/v1/church-profile", { name: name.trim(), tagline: tagline.trim(), address: address.trim(), phone: phone.trim() });
    setBusy(false);
    if (r.ok) { const p = r.data as ChurchProfile; setSaved(p); setTagline(p.tagline); setDone(true); router.refresh(); } else setError(errMsg(r.data));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-[560px] text-[13.5px] font-medium leading-relaxed text-[var(--ink-2)]">Nama dan kontak gereja tampil di menu samping, kop cetak notulen, dan gambar notulen yang dibagikan ke WhatsApp.</p>
        <button type="button" onClick={save} disabled={!dirty || !valid || busy} className={`${btnPrimary} !h-[46px] !px-[22px] max-md:hidden`}>{busy ? "Menyimpan…" : "Simpan perubahan"}</button>
      </div>
      <Fab dot={dirty} actions={[{ key: "save", label: busy ? "Menyimpan…" : "Simpan perubahan", icon: "save", disabled: !dirty || !valid || busy, busy, onClick: save }]} />
      {error && <p role="alert" className="rounded-xl border border-[#f0c7c7] bg-[#fdf1f1] px-4 py-3 text-sm font-semibold text-[#9b1c1c]">{error}</p>}

      <div className="flex flex-wrap items-start gap-5">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-[18px] rounded-[20px] border border-[var(--line)] bg-white p-6">
          <div className="flex items-center gap-2.5"><span className={eyebrow}>DATA GEREJA</span><span className="h-px flex-1 bg-[#e8e4d6]" /></div>
          <Field label="Nama gereja"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputCls} placeholder="Mis. GKI Contoh Surabaya" /></Field>
          <Field label="Baris kecil di bawah nama" hint="Tampil di menu samping. Kosongkan untuk memakai “Penjadwalan gereja”."><input value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={80} className={inputCls} /></Field>
          <Field label="Alamat (tidak wajib)"><input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} className={inputCls} placeholder="Jl. …, Surabaya" /></Field>
          <Field label="Telepon (tidak wajib)"><input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} className={inputCls} placeholder="031-…" /></Field>
        </section>

        <aside className="flex min-w-[300px] max-md:min-w-0 max-w-[400px] flex-[1_1_320px] flex-col gap-3 rounded-[20px] border border-[var(--line)] bg-white p-[22px]">
          <div className="flex items-center gap-2.5"><span className={eyebrow}>PRATINJAU KOP</span><span className="h-px flex-1 bg-[#e8e4d6]" /></div>
          <div className="flex flex-col items-center gap-1 rounded-xl border border-[var(--line)] px-4 py-5 text-center">
            <span className="text-[17px] font-extrabold">{name.trim() || "Nama gereja"}</span>
            {(address.trim() || phone.trim()) && <span className="text-[12.5px] font-medium text-[var(--ink-2)]">{[address.trim(), phone.trim()].filter(Boolean).join(" · ")}</span>}
            <span className="mt-2 w-full border-t-2 border-[var(--ink)] pt-2 text-[11px] font-bold tracking-[0.14em] text-[var(--ink-2)]">NOTULEN RAPAT</span>
          </div>
        </aside>
      </div>

      {done && (
        <SavedDialog title="Profil gereja berhasil disimpan" message="Nama baru langsung tampil di menu samping dan kop notulen." onClose={() => setDone(false)}
          actions={[{ label: "Tetap di halaman ini", onClick: () => setDone(false) }, { label: "Ke kalender", onClick: () => router.push("/"), primary: true }]} />
      )}
    </div>
  );
}
