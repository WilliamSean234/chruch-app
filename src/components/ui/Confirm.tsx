"use client";

import { useEffect, useRef, useState } from "react";

export type ConfirmOptions = {
  title?: string;
  /** Teks tombol setuju. Bila kosong diambil dari kata pertama pesan (mis. "Hapus"). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Merah untuk tindakan merusak. Bila kosong ditebak dari kata pertama pesan. */
  danger?: boolean;
};
type Pending = { title: string; body: string; confirmLabel: string; cancelLabel: string; danger: boolean; resolve: (ok: boolean) => void };

let show: ((p: Pending) => void) | null = null;

const DANGER = /^(Hapus|Keluarkan|Nonaktifkan|Batalkan)\b/;

/**
 * Pengganti window.confirm yang tampil sebagai dialog aplikasi.
 * Pesan berpola "Judul? Penjelasan." dipecah otomatis: kalimat sampai tanda tanya menjadi judul, sisanya penjelasan.
 * Pemakaian: `if (!(await askConfirm(`Hapus ${nama}? Data tidak bisa dipulihkan.`))) return;`
 */
export function askConfirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  const q = message.indexOf("?");
  const title = opts.title ?? (q >= 0 ? message.slice(0, q + 1) : "Konfirmasi");
  const body = opts.title ? message : q >= 0 ? message.slice(q + 1).trim() : message;
  const first = message.split(/\s+/)[0] ?? "";
  const danger = opts.danger ?? DANGER.test(message);
  const confirmLabel = opts.confirmLabel ?? (/^[A-Za-zÀ-ÿ]+$/.test(first) ? first : "Ya");
  return new Promise<boolean>((resolve) => {
    if (!show) { resolve(window.confirm(message)); return; } // cadangan bila host belum terpasang
    show({ title, body, confirmLabel, cancelLabel: opts.cancelLabel ?? "Batal", danger, resolve });
  });
}

/** Pasang sekali di root layout. */
export default function ConfirmHost() {
  const [queue, setQueue] = useState<Pending[]>([]);
  const cur = queue[0] ?? null;
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = (p) => setQueue((q) => [...q, p]);
    return () => { show = null; };
  }, []);

  const close = (ok: boolean) => { cur?.resolve(ok); setQueue((q) => q.slice(1)); };

  useEffect(() => {
    if (!cur) return;
    (cur.danger ? cancelRef : okRef).current?.focus(); // tindakan merusak: fokus awal di Batal
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); cur.resolve(false); setQueue((q) => q.slice(1)); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cur]);

  if (!cur) return null;
  const tone = cur.danger ? { bg: "#FDF1F1", fg: "#9B1C1C", btn: "bg-[#B42318] hover:bg-[#9B1C1C]" } : { bg: "#EEF0FD", fg: "#3037A8", btn: "bg-[var(--primary)] hover:brightness-110" };
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#171a2c]/45 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) close(false); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body"
        className="flex w-full max-w-[420px] flex-col gap-5 rounded-[22px] border border-[var(--line)] bg-white p-6 shadow-[0_24px_60px_-20px_rgba(30,34,90,0.5)]">
        <div className="flex items-start gap-4">
          <span className="grid size-11 flex-none place-items-center rounded-full" style={{ background: tone.bg, color: tone.fg }} aria-hidden="true">
            {cur.danger ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9.5 16.5a1 1 0 01-.87 1.5H3.37a1 1 0 01-.87-1.5L12 3z" /><path d="M12 10v4M12 17.5h.01" /></svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></svg>
            )}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 id="confirm-title" className="m-0 text-[17px] font-extrabold leading-snug">{cur.title}</h2>
            {cur.body && <p id="confirm-body" className="m-0 text-sm font-medium leading-relaxed text-[var(--ink-2)]">{cur.body}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2.5">
          <button ref={cancelRef} type="button" onClick={() => close(false)} className="h-11 rounded-xl border border-[var(--line)] bg-white px-5 text-sm font-bold hover:bg-[var(--bg)]">{cur.cancelLabel}</button>
          <button ref={okRef} type="button" onClick={() => close(true)} className={`h-11 rounded-xl px-5 text-sm font-bold text-white ${tone.btn}`}>{cur.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
