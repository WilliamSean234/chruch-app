"use client";

import { useEffect, useRef, useState } from "react";
import { showToast } from "./Toast";

/**
 * Khusus HP: pemberitahuan yang biasanya tampil sebagai kartu di halaman (role="alert" dan role="status")
 * disembunyikan lewat CSS (globals.css) dan isinya ditampilkan sebagai popup, supaya tidak terlewat
 * saat halaman sedang digulir ke bawah.
 * - role="alert" (gagal, peringatan)  → dialog yang harus ditutup dengan "Mengerti"
 * - role="status" (hasil aksi, info)   → toast singkat
 * Elemen yang diberi atribut `data-keep` (dan isinya) dikecualikan, mis. kartu yang punya tombol aksi sendiri.
 * Di layar lebar (desktop) tidak ada yang berubah: kartu tetap tampil di halaman.
 */

type Notice = { title: string; message: string };
let push: ((n: Notice) => void) | null = null;

/** Tampilkan dialog pemberitahuan secara langsung dari kode (di semua ukuran layar). */
export function showNotice(message: string, title = "Perhatian") { push?.({ title, message }); }

const MOBILE = "(max-width: 767px)";
const SELECTOR = '[role="alert"],[role="status"]';

export default function NoticeHost() {
  const [queue, setQueue] = useState<Notice[]>([]);
  const okRef = useRef<HTMLButtonElement>(null);
  const cur = queue[0] ?? null;

  useEffect(() => {
    push = (n) => setQueue((q) => (q.some((x) => x.message === n.message) ? q : [...q, n]));
    const mq = window.matchMedia(MOBILE);
    const seen = new WeakMap<Element, string>(); // teks terakhir yang sudah dimunculkan per elemen
    const pending = new Set<Element>();
    let raf = 0;

    const check = (el: Element) => {
      if (!mq.matches || el.closest("[data-keep]")) return;
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (!text) { seen.delete(el); return; }
      if (seen.get(el) === text) return;
      seen.set(el, text);
      if (el.getAttribute("role") === "alert") push?.({ title: "Perhatian", message: text });
      else showToast(text, "success");
    };
    const flush = () => { raf = 0; pending.forEach(check); pending.clear(); };
    const enqueue = (el: Element) => { pending.add(el); if (!raf) raf = requestAnimationFrame(flush); };
    const up = (node: Node | null) => { const el = node && node.nodeType === 1 ? (node as Element) : node?.parentElement; const hit = el?.closest(SELECTOR); if (hit) enqueue(hit); };

    const mo = new MutationObserver((muts) => {
      if (!mq.matches) return;
      for (const m of muts) {
        up(m.target);
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) { up(n); return; }
          const el = n as Element;
          if (el.matches(SELECTOR)) enqueue(el);
          el.querySelectorAll(SELECTOR).forEach(enqueue);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.querySelectorAll(SELECTOR).forEach(enqueue);
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf); push = null; };
  }, []);

  const close = () => setQueue((q) => q.slice(1));

  useEffect(() => {
    if (!cur) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setQueue((q) => q.slice(1)); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [cur]);

  if (!cur) return null;
  return (
    <div className="fixed inset-0 z-[75] grid place-items-center bg-[#171a2c]/45 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="notice-title" aria-describedby="notice-body"
        className="flex max-h-[85vh] w-full max-w-[420px] flex-col gap-5 overflow-y-auto rounded-[22px] border border-[var(--line)] bg-white p-6 shadow-[0_24px_60px_-20px_rgba(30,34,90,0.5)]">
        <div className="flex items-start gap-4">
          <span className="grid size-11 flex-none place-items-center rounded-full bg-[#FDF1F1] text-[#9B1C1C]" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></svg>
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 id="notice-title" className="m-0 text-[17px] font-extrabold leading-snug">{cur.title}</h2>
            <p id="notice-body" className="m-0 break-words text-sm font-medium leading-relaxed text-[var(--ink-2)]">{cur.message}</p>
          </div>
        </div>
        <div className="flex justify-end">
          <button ref={okRef} type="button" onClick={close} className="h-11 rounded-xl bg-[var(--primary)] px-6 text-sm font-bold text-white hover:brightness-110">Mengerti</button>
        </div>
      </div>
    </div>
  );
}
