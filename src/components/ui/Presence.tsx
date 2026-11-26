"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PRESENCE_BEAT_MS, PRESENCE_IDLE_MS } from "@/lib/presenceRules";

/**
 * Status online.
 * - PresenceBeat (dipasang sekali di AppShell): selama tab terlihat dan dipakai, mengirim tanda "saya online" tiap 15 detik.
 *   Saat tab ditutup, disembunyikan, atau penggunanya diam 5 menit, langsung mengirim "offline" (sendBeacon tetap jalan walau tab sedang ditutup).
 *   Bila sinyal "offline" itu hilang (HP mati, sinyal putus), server menganggap offline sendiri setelah 40 detik.
 * - useOnlinePeople (dipakai di Orang & pelayanan): mengambil daftar yang online tiap 4 detik selama halaman terlihat dan dipakai,
 *   dan seketika saat halaman dibuka kembali. Bila daftarnya berubah, `onChange` dipanggil (mis. memuat ulang tabel yang sedang difilter).
 */
const POLL_MS = 4_000;
const ENDPOINT = "/api/v1/me/presence";

function clientId(): string {
  try {
    const k = "presence:client";
    let id = sessionStorage.getItem(k);
    if (!id) { id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, ""); sessionStorage.setItem(k, id); }
    return id;
  } catch { return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
}

function send(state: "on" | "off", id: string) {
  const body = JSON.stringify({ clientId: id, state });
  try {
    if (state === "off" && navigator.sendBeacon?.(ENDPOINT, body)) return; // teks biasa: tanpa preflight, tetap terkirim saat tab ditutup
  } catch { /* lanjut ke fetch */ }
  void fetch(ENDPOINT, { method: "POST", body, keepalive: true, cache: "no-store" }).catch(() => { /* jaringan putus: server akan menganggap offline sendiri */ });
}

export function PresenceBeat() {
  useEffect(() => {
    const id = clientId();
    let on = false;
    let lastActive = Date.now();
    const usable = () => document.visibilityState === "visible" && Date.now() - lastActive < PRESENCE_IDLE_MS;
    const goOn = () => { on = true; send("on", id); };
    const goOff = () => { if (on) { on = false; send("off", id); } };
    const sync = () => { if (usable()) goOn(); else goOff(); };

    const tick = setInterval(() => { if (usable()) goOn(); else goOff(); }, PRESENCE_BEAT_MS);
    const touch = () => { lastActive = Date.now(); if (!on && document.visibilityState === "visible") goOn(); };
    let moved = 0;
    const move = () => { const n = Date.now(); if (n - moved > 5_000) { moved = n; touch(); } }; // gerak kursor dihitung, tetapi tidak tiap milidetik
    const onVis = () => { if (document.visibilityState === "visible") { lastActive = Date.now(); goOn(); } else goOff(); };
    const onHide = () => goOff();
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) { lastActive = Date.now(); goOn(); } };

    sync();
    const opts = { passive: true } as const;
    window.addEventListener("pointerdown", touch, opts);
    window.addEventListener("keydown", touch, opts);
    window.addEventListener("scroll", touch, opts);
    window.addEventListener("pointermove", move, opts);
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("pageshow", onShow);
    return () => {
      clearInterval(tick);
      window.removeEventListener("pointerdown", touch); window.removeEventListener("keydown", touch); window.removeEventListener("scroll", touch); window.removeEventListener("pointermove", move);
      window.removeEventListener("focus", onVis); document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide); window.removeEventListener("pageshow", onShow);
      // sengaja tidak mengirim "offline" di sini: pindah halaman membongkar dan memasang ulang komponen ini, dan itu bukan keluar dari aplikasi
    };
  }, []);
  return null;
}

/** Id orang (Person.id) yang sedang online, diperbarui langsung. `null` selama belum terambil. */
export function useOnlinePeople(enabled: boolean, onChange?: () => void): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null);
  const cb = useRef(onChange);
  useEffect(() => { cb.current = onChange; });
  const last = useRef<string | null>(null);

  const pull = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/presence", { cache: "no-store" });
      if (!r.ok) return;
      const list = ((await r.json()) as { personIds?: string[] }).personIds ?? [];
      const key = list.join(",");
      if (key === last.current) return;
      const first = last.current === null;
      last.current = key;
      setIds(new Set(list));
      if (!first) cb.current?.();
    } catch { /* coba lagi pada giliran berikutnya */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let lastActive = Date.now();
    let inflight = false;
    const usable = () => document.visibilityState === "visible" && Date.now() - lastActive < PRESENCE_IDLE_MS;
    const run = async () => { if (inflight) return; inflight = true; try { await pull(); } finally { inflight = false; } };
    void run();
    const timer = setInterval(() => { if (usable()) void run(); }, POLL_MS);
    const wake = () => { if (document.visibilityState === "visible") { lastActive = Date.now(); void run(); } };
    const touch = () => { const idle = Date.now() - lastActive >= PRESENCE_IDLE_MS; lastActive = Date.now(); if (idle) void run(); };
    const opts = { passive: true } as const;
    window.addEventListener("pointerdown", touch, opts);
    window.addEventListener("keydown", touch, opts);
    window.addEventListener("scroll", touch, opts);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pointerdown", touch); window.removeEventListener("keydown", touch); window.removeEventListener("scroll", touch);
      window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake);
    };
  }, [enabled, pull]);

  return ids;
}

/** Titik status di pojok avatar: hijau = online, abu-abu = punya akun tetapi tidak online. Tanpa akun: tidak ada titik. */
export function OnlineDot({ online }: { online: boolean }) {
  return (
    <span role="img" aria-label={online ? "Online" : "Offline"} title={online ? "Online" : "Offline"}
      className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-white transition-colors duration-300 ${online ? "bg-[#22A559]" : "bg-[#B9BDCB]"}`} />
  );
}
