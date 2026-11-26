"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Modal, { Field } from "@/components/master/Modal";
import { showNotice } from "@/components/ui/NoticeHost";
import { showToast } from "@/components/ui/Toast";
import { dayShort, hm } from "@/lib/ui";
import { useOnBadgesChanged } from "@/components/ui/LiveBadges";
import { btnGhost, btnPrimary, callApi, errMsg } from "./api";

type Item = {
  id: string; eventId: string; eventTitle: string; startsAt: string; endsAt: string; ministry: string; team: string;
  requester: string; reason: string; suggestedName: string | null; createdAt: string;
};

/**
 * Permintaan pengganti dari pelayan yang menunggu keputusan (di atas daftar Jadwal acara). Muncul hanya bila ada.
 * Menyetujui = membuka acaranya lalu mengisi kursi itu dengan orang lain seperti biasa (bentrok dan aturan tetap diperiksa);
 * permintaan otomatis selesai begitu kursinya berganti. Menolak minta catatan singkat dan pelayan diberi tahu.
 */
export default function SwapRequestsPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [rejecting, setRejecting] = useState<Item | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await callApi("GET", "/api/v1/swap-requests");
    if (r.ok) setItems(r.data.items as Item[]);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useOnBadgesChanged(load); // permintaan baru masuk atau sudah diputuskan di tempat lain: daftar ikut diperbarui

  if (items.length === 0 && !rejecting) return null;

  const reject = async () => {
    if (!rejecting) return;
    setBusy(true);
    const r = await callApi("POST", `/api/v1/swap-requests/${rejecting.id}/reject`, { note: note.trim() || null });
    setBusy(false);
    if (!r.ok) { showNotice(errMsg(r.data), "Gagal menolak"); void load(); setRejecting(null); return; }
    showToast("Permintaan ditolak. Pelayan diberi tahu.");
    setItems((cur) => cur.filter((x) => x.id !== rejecting.id));
    setRejecting(null); setNote("");
  };

  return (
    <section aria-label="Permintaan pengganti" className="flex flex-col gap-3 rounded-[20px] border border-[#E7C27A] bg-[#FFFAF0] p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-[15px] font-extrabold">Permintaan pengganti ({items.length})</h2>
        <p className="m-0 text-xs font-medium text-[var(--ink-2)]">Buka acaranya lalu isi posisi itu dengan orang lain. Permintaan selesai sendiri begitu posisinya berganti.</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {items.map((it) => (
          <li key={it.id} className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-white p-3.5">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-extrabold">{it.requester} · {it.ministry}{it.team ? ` (${it.team})` : ""}</span>
              <span className="text-[13px] font-semibold text-[var(--ink-2)]">{it.eventTitle} · {dayShort(it.startsAt)}, {hm(it.startsAt)}–{hm(it.endsAt)}</span>
            </div>
            <p className="m-0 whitespace-pre-line break-words text-[13px] font-medium">Alasan: {it.reason}</p>
            {it.suggestedName && <p className="m-0 text-[13px] font-medium text-[var(--ink-2)]">Usulan pengganti: {it.suggestedName}</p>}
            <div className="flex flex-wrap gap-2">
              <Link href={`/jadwal/${it.eventId}`} className={`${btnPrimary} flex items-center`}>Pilih pengganti</Link>
              <button type="button" onClick={() => { setNote(""); setRejecting(it); }} className={btnGhost}>Tolak</button>
            </div>
          </li>
        ))}
      </ul>

      {rejecting && (
        <Modal title="Tolak permintaan?" onClose={() => setRejecting(null)} dirty={note.trim().length > 0}
          footer={<><button type="button" onClick={() => setRejecting(null)} disabled={busy} className={btnGhost}>Batal</button><button type="button" onClick={reject} disabled={busy} className={btnPrimary}>{busy ? "Menolak…" : "Tolak permintaan"}</button></>}>
          <p className="m-0 mb-3 text-sm font-medium text-[var(--ink-2)]">{rejecting.requester} tetap bertugas sebagai {rejecting.ministry} di {rejecting.eventTitle}. Ia akan diberi tahu.</p>
          <Field label="Catatan untuk pelayan (boleh dikosongkan)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} rows={3} placeholder="Mis. belum ada yang bisa menggantikan, mohon tetap hadir" className="w-full rounded-xl border border-[var(--line)] bg-white p-3 text-sm font-semibold" />
          </Field>
        </Modal>
      )}
    </section>
  );
}
