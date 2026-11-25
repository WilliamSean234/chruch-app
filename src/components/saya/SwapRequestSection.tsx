"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { askConfirm } from "@/components/ui/Confirm";
import { showNotice } from "@/components/ui/NoticeHost";
import { showToast } from "@/components/ui/Toast";
import { btnGhost, btnPrimary, callApi, errMsg } from "@/components/jadwal/api";

export type SwapState = { id: string; status: "PENDING" | "REJECTED"; suggestedName: string | null; note: string | null } | null;

const area = "w-full rounded-xl border border-[var(--line)] bg-white p-3 text-sm font-semibold";

/**
 * "Minta pengganti" di rincian jadwal: pelayan menulis alasan (dan boleh mengusulkan nama), lalu Penjadwal atau Admin Tim tim itu
 * yang memutuskan. Jadwal tidak berubah sebelum penggantinya ditetapkan; selama menunggu, pelayan tetap bertugas.
 */
export default function SwapRequestSection({ assignmentId, role, canSwap, swap }: { assignmentId: string; role: string; canSwap: boolean; swap: SwapState }) {
  const router = useRouter();
  const [state, setState] = useState<SwapState>(swap);
  const [can, setCan] = useState(canSwap);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [suggest, setSuggest] = useState("");
  const [busy, setBusy] = useState(false);

  if (!state && !can) return null;

  const send = async () => {
    if (reason.trim().length < 3) { showNotice("Tulis alasannya dulu, minimal 3 huruf.", "Alasan belum diisi"); return; }
    setBusy(true);
    const r = await callApi("POST", "/api/v1/swap-requests", { assignmentId, reason: reason.trim(), suggestedName: suggest.trim() || null });
    setBusy(false);
    if (!r.ok) { showNotice(errMsg(r.data), "Permintaan belum terkirim"); return; }
    setState({ id: r.data.id, status: "PENDING", suggestedName: suggest.trim() || null, note: null });
    setCan(false); setOpen(false); setReason(""); setSuggest("");
    showToast("Permintaan terkirim ke Penjadwal");
    router.refresh();
  };

  const cancel = async () => {
    if (!state) return;
    if (!(await askConfirm("Batalkan permintaan pengganti? Anda tetap bertugas di posisi ini.", { confirmLabel: "Batalkan permintaan", cancelLabel: "Tidak jadi", danger: false }))) return;
    setBusy(true);
    const r = await callApi("POST", `/api/v1/swap-requests/${state.id}/cancel`);
    setBusy(false);
    if (!r.ok) { showNotice(errMsg(r.data), "Gagal membatalkan"); return; }
    setState(null); setCan(true);
    showToast("Permintaan dibatalkan");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3.5">
      {state?.status === "PENDING" && (
        <>
          <span className="text-sm font-extrabold">Menunggu keputusan Penjadwal</span>
          <span className="text-[13px] font-medium text-[var(--ink-2)]">
            Anda meminta diganti sebagai {role}.{state.suggestedName ? ` Usulan pengganti: ${state.suggestedName}.` : ""} Sampai ada pengganti, Anda tetap bertugas.
          </span>
          <button type="button" onClick={cancel} disabled={busy} className={`${btnGhost} self-start`}>Batalkan permintaan</button>
        </>
      )}
      {state?.status === "REJECTED" && (
        <span className="text-[13px] font-semibold text-[var(--ink-2)]">
          Permintaan penggantian sebelumnya ditolak{state.note ? `: ${state.note}` : ""}. Anda tetap bertugas sebagai {role}.
        </span>
      )}
      {can && !open && (
        <>
          {state?.status !== "REJECTED" && <span className="text-[13px] font-medium text-[var(--ink-2)]">Tidak bisa hadir? Minta Penjadwal mencarikan pengganti untuk posisi {role}.</span>}
          <button type="button" onClick={() => setOpen(true)} className={`${btnGhost} self-start`}>Minta pengganti</button>
        </>
      )}
      {can && open && (
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-bold">Alasan</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} rows={3} placeholder="Mis. sakit, tugas keluar kota" className={area} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[13px] font-bold">Usulan pengganti <span className="font-medium text-[var(--ink-2)]">(boleh dikosongkan)</span></span>
            <input value={suggest} onChange={(e) => setSuggest(e.target.value)} maxLength={80} placeholder="Nama orang yang sudah Anda tanya" className={`${area} h-11`} />
          </label>
          <p className="m-0 text-xs font-medium text-[var(--ink-2)]">Jadwal baru berubah setelah Penjadwal menetapkan pengganti. Sampai saat itu Anda tetap bertugas.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={busy} className={btnGhost}>Batal</button>
            <button type="button" onClick={send} disabled={busy} className={btnPrimary}>{busy ? "Mengirim…" : "Kirim permintaan"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
