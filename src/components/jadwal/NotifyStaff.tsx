"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/master/Modal";
import { askConfirm } from "@/components/ui/Confirm";
import { showToast } from "@/components/ui/Toast";
import { STAFF_AUDIENCES, type StaffAudience } from "@/lib/notifyAudience";
import { btnPrimary, callApi, errMsg } from "./api";

type Info = { status: string; ended: boolean; audiences: { audience: StaffAudience; people: number; reachable: number }[]; lastSentAt: string | null };

const fmt = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

/** Dialog "Beri tahu pelayan": pilih kelompok penerima, lalu kirim notifikasi jadwal ke HP mereka. */
export default function NotifyStaff({ eventId, title, onClose }: { eventId: string; title: string; onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState<StaffAudience>("ALL");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void callApi("GET", `/api/v1/events/${eventId}/notify`).then((r) => (r.ok ? setInfo(r.data) : setError(errMsg(r.data))));
  }, [eventId]);

  const count = (a: StaffAudience) => info?.audiences.find((x) => x.audience === a);
  const chosen = count(pick);

  const send = async () => {
    if (!chosen || chosen.people === 0) return;
    const label = STAFF_AUDIENCES.find((a) => a.value === pick)!.label.toLowerCase();
    if (info?.lastSentAt && !(await askConfirm(`Kirim lagi? Pemberitahuan untuk acara ini terakhir dikirim ${fmt(info.lastSentAt)}. Pelayan akan menerima pesan sekali lagi.`, { confirmLabel: "Kirim lagi" }))) return;
    if (!(await askConfirm(`Kirim ke ${label}? ${chosen.people} orang akan diberi tahu jadwal dan posisinya di ${title}.`, { confirmLabel: "Kirim" }))) return;
    setBusy(true);
    const r = await callApi("POST", `/api/v1/events/${eventId}/notify`, { audience: pick });
    setBusy(false);
    if (!r.ok) { showToast(errMsg(r.data), "error"); return; }
    const d = r.data as { total: number; sent: number; noAccount: number; noDevice: number; off: number; failed: number };
    const skipped = d.noAccount + d.noDevice + d.off;
    showToast(`Terkirim ke ${d.sent} dari ${d.total} orang.${skipped ? ` ${skipped} orang belum bisa dijangkau (belum punya akun, belum mengaktifkan notifikasi, atau mematikan pesan ini).` : ""}${d.failed ? ` ${d.failed} gagal terkirim.` : ""}`, d.sent > 0 ? "success" : "error");
    onClose();
  };

  return (
    <Modal title="Beri tahu pelayan" onClose={onClose}
      footer={<>
        <button type="button" className="h-11 rounded-xl border border-[#D0D3E8] bg-white px-4 text-sm font-bold text-[var(--primary-ink)]" onClick={onClose}>Tutup</button>
        <button type="button" className={btnPrimary} disabled={busy || !info || info.status !== "PUBLISHED" || info.ended || !chosen || chosen.people === 0} onClick={send}>{busy ? "Mengirim…" : "Kirim"}</button>
      </>}>
      {error ? <p className="text-sm font-semibold text-[var(--ink-2)]">{error}</p> : !info ? <p className="text-sm font-semibold text-[var(--ink-2)]">Memuat…</p> : (
        <div className="flex flex-col gap-4">
          <p className="text-sm font-medium leading-relaxed text-[var(--ink-2)]">Pelayan yang dipilih menerima satu notifikasi berisi jadwal dan posisinya di <b>{title}</b>.</p>
          {info.status !== "PUBLISHED" && <p role="status" className="rounded-xl bg-[#FFFBF0] px-3.5 py-2.5 text-sm font-semibold text-[#6F4304]">Acara ini belum terbit. Terbitkan jadwalnya dulu.</p>}
          {info.ended && <p role="status" className="rounded-xl bg-[#FFFBF0] px-3.5 py-2.5 text-sm font-semibold text-[#6F4304]">Acara ini sudah selesai.</p>}
          {info.lastSentAt && <p className="text-xs font-semibold text-[var(--ink-2)]">Terakhir dikirim: {fmt(info.lastSentAt)}</p>}
          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="sr-only">Penerima</legend>
            {STAFF_AUDIENCES.map((a) => {
              const c = count(a.value);
              const none = !c || c.people === 0;
              return (
                <label key={a.value} className={`flex items-start gap-3 rounded-xl border p-3 ${pick === a.value ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--line)] bg-white"} ${none ? "opacity-60" : ""}`}>
                  <input type="radio" name="staff-audience" className="mt-1 size-[18px] flex-none accent-[var(--primary)]" checked={pick === a.value} disabled={none} onChange={() => setPick(a.value)} />
                  <span className="flex flex-col">
                    <span className="text-sm font-bold">{a.label}</span>
                    <span className="text-xs font-medium leading-snug text-[var(--ink-2)]">{a.hint}</span>
                    <span className="mt-0.5 text-xs font-bold text-[var(--ink-2)]">{none ? "Belum ada yang terjadwal" : `${c!.people} orang · ${c!.reachable} sudah mengaktifkan notifikasi`}</span>
                  </span>
                </label>
              );
            })}
          </fieldset>
        </div>
      )}
    </Modal>
  );
}
