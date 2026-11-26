"use client";

import { useEffect, useState } from "react";

/**
 * Satu browser hanya punya satu sesi login (cookie dipakai bersama semua tab). Bila di tab lain Anda masuk dengan akun berbeda atau keluar,
 * tab ini otomatis keluar juga, tanpa menunggu diklik, supaya tidak ada tab yang tampak sebagai akun A padahal sesinya sudah akun B.
 * - Halaman login dan form ganti sandi memanggil announceSessionChange() setelah sesinya berubah; semua tab lain langsung diberi tahu.
 * - Tiap tab lalu menanyakan ke server "saya siapa sekarang?" (/api/v1/me) dan membandingkannya dengan akun yang membuka halaman ini.
 *   Pesan hanya pemicu, jadi pesan palsu tidak bisa mengeluarkan siapa pun: yang menentukan adalah jawaban server.
 * - Tanpa pesan pun, pengecekan yang sama jalan saat tab ini dibuka kembali atau mendapat fokus.
 */
const CHANNEL = "auth-session";
const KEY = "auth-session:ping";

/** Beri tahu semua tab lain di browser ini bahwa sesi login baru saja berubah (masuk, keluar, atau ganti akun). */
export function announceSessionChange() {
  try { const c = new BroadcastChannel(CHANNEL); c.postMessage({ at: Date.now() }); c.close(); } catch { /* browser lama */ }
  try { localStorage.setItem(KEY, String(Date.now())); } catch { /* penyimpanan dimatikan */ }
}

export default function SessionWatch({ userId }: { userId: string }) {
  const [gone, setGone] = useState<null | "switched" | "signedOut">(null);

  useEffect(() => {
    let done = false, inflight = false;
    const expire = (why: "switched" | "signedOut") => {
      if (done) return;
      done = true;
      setGone(why);
      setTimeout(() => { window.location.replace("/login"); }, 1_500);
    };
    async function verify() {
      if (done || inflight) return;
      inflight = true;
      try {
        const r = await fetch("/api/v1/me", { cache: "no-store" });
        if (r.status === 401) expire("signedOut");
        else if (r.ok) { const d = (await r.json()) as { userId?: string }; if (d.userId && d.userId !== userId) expire("switched"); }
        // galat lain (jaringan, 5xx): jangan keluarkan siapa pun
      } catch { /* jaringan putus */ }
      finally { inflight = false; }
    }
    let ch: BroadcastChannel | null = null;
    try { ch = new BroadcastChannel(CHANNEL); ch.onmessage = () => void verify(); } catch { /* browser lama: storage di bawah */ }
    const onStorage = (e: StorageEvent) => { if (e.key === KEY) void verify(); };
    const onVis = () => { if (document.visibilityState === "visible") void verify(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      ch?.close();
      window.removeEventListener("storage", onStorage); window.removeEventListener("focus", onVis); document.removeEventListener("visibilitychange", onVis);
    };
  }, [userId]);

  if (!gone) return null;
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-[var(--bg)]/95 p-6 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-label="Sesi berakhir">
      <div className="flex max-w-sm flex-col items-center gap-2 rounded-2xl border border-[var(--line)] bg-white px-7 py-6 text-center shadow-lg">
        <span className="text-lg font-extrabold">Anda keluar dari tab ini</span>
        <span className="text-sm font-medium text-[var(--ink-2)]">{gone === "switched" ? "Akun lain baru saja masuk di tab lain pada browser ini, jadi tab ini ditutup sesinya." : "Sesi Anda sudah berakhir (keluar di tab lain)."} Mengalihkan ke halaman masuk…</span>
      </div>
    </div>
  );
}
