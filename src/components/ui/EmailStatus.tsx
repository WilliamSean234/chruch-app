"use client";

import { useState } from "react";
import { callApi, errMsg } from "@/components/jadwal/api";
import { showToast } from "@/components/ui/Toast";

/** Status verifikasi email (tab Notifikasi). Email yang terverifikasi dipakai sebagai cadangan bila notifikasi HP belum aktif. */
export default function EmailStatus({ email, verified, mailOn }: { email: string; verified: boolean; mailOn: boolean }) {
  const [busy, setBusy] = useState(false);
  if (!verified && !mailOn) return null; // belum ada yang bisa dilakukan
  const send = async () => {
    setBusy(true);
    const r = await callApi("POST", "/api/v1/me/email");
    setBusy(false);
    showToast(r.ok ? `Email verifikasi dikirim ke ${r.data.email}. Buka tautannya, lalu muat ulang halaman ini.` : errMsg(r.data), r.ok ? "success" : "error");
  };
  return (
    <section className="flex flex-col gap-2 rounded-[20px] border border-[var(--line)] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">Email</span>
        <span className={`rounded-full px-2.5 py-[3px] text-xs font-bold ${verified ? "bg-[#E3F3E7] text-[#1B6B34]" : "bg-[#FBF0D9] text-[#6F4304]"}`}>{verified ? "Terverifikasi" : "Belum terverifikasi"}</span>
      </div>
      <p className="break-all text-[13px] font-medium text-[var(--ink-2)]">{email}</p>
      <p className="text-xs font-medium leading-snug text-[var(--ink-2)]">{verified ? "Pesan jadwal dikirim ke email ini bila notifikasi HP belum aktif." : "Verifikasi email agar pesan jadwal bisa dikirim ke sini bila notifikasi HP belum aktif."}</p>
      {!verified && <button type="button" disabled={busy} onClick={() => void send()} className="h-11 self-start rounded-xl border border-[#D0D3E8] bg-white px-4 text-sm font-bold text-[var(--primary-ink)] hover:bg-[#f3f4f9] disabled:opacity-50">{busy ? "Mengirim…" : "Kirim email verifikasi"}</button>}
    </section>
  );
}
