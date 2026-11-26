"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";

/**
 * Penanda angka di menu yang diperbarui langsung, tanpa pindah halaman atau muat ulang.
 * - Nilai awal dari server (BadgeLive) disalin ke satu penyimpan bersama; semua penanda membacanya dari sana.
 * - Selama tab terlihat dan penggunanya aktif, angka diambil ulang tiap 30 detik, saat tab dibuka kembali, dan seketika
 *   setelah pengguna menyimpan sesuatu (callApi mengirim "badges:refresh"), jadi menyetujui atau menolak langsung mengubah angka.
 * - Berhenti bila tab tersembunyi atau pengguna diam 10 menit (supaya database gratis boleh tidur); lanjut begitu ada gerakan.
 * - Bila angka berubah, kejadian "badges:changed" dikirim supaya daftar di halaman (permintaan pengganti, permintaan daftar) ikut dimuat ulang.
 */
export type BadgeCounts = { pengaturan: number; jadwal: number };
export type BadgeKey = keyof BadgeCounts;

export const BADGES_REFRESH = "badges:refresh";
export const BADGES_CHANGED = "badges:changed";
const EVERY_MS = 30_000;
const IDLE_MS = 10 * 60_000;

let store: BadgeCounts | null = null;
const subs = new Set<() => void>();
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** Simpan angka baru; true bila berbeda dari sebelumnya. */
function setCounts(next: BadgeCounts): boolean {
  if (store && store.pengaturan === next.pengaturan && store.jadwal === next.jadwal) return false;
  const first = store === null;
  store = next;
  subs.forEach((f) => f());
  return !first;
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Pasang sekali per halaman (di AppShell): menyalin angka dari server dan, bila ada yang dipantau, menjalankan pembaruan langsung. */
export function BadgeLive({ initial, watch }: { initial: BadgeCounts; watch: { pengaturan: boolean; jadwal: boolean } }) {
  // halaman baru dari server selalu lebih segar daripada angka lama di penyimpan
  useIsoLayoutEffect(() => { setCounts(initial); }, [initial.pengaturan, initial.jadwal]); // eslint-disable-line react-hooks/exhaustive-deps

  const on = watch.pengaturan || watch.jadwal;
  useEffect(() => {
    if (!on) return;
    let stopped = false, inflight = false, queued = false;
    let timer: ReturnType<typeof setTimeout> | undefined, debounce: ReturnType<typeof setTimeout> | undefined;
    let lastActive = Date.now();
    const visible = () => document.visibilityState === "visible";

    async function pull() {
      if (stopped) return;
      if (inflight) { queued = true; return; }
      inflight = true;
      try {
        const r = await fetch("/api/v1/me/badges", { cache: "no-store" });
        if (r.ok) {
          const d = (await r.json()) as Partial<BadgeCounts>;
          if (setCounts({ pengaturan: d.pengaturan ?? 0, jadwal: d.jadwal ?? 0 })) window.dispatchEvent(new Event(BADGES_CHANGED));
        }
      } catch { /* jaringan putus: coba lagi pada giliran berikutnya */ }
      finally { inflight = false; if (queued) { queued = false; void pull(); } }
    }
    const tick = () => { if (visible() && Date.now() - lastActive < IDLE_MS) void pull(); timer = setTimeout(tick, EVERY_MS); };
    const touch = () => { const wasIdle = Date.now() - lastActive >= IDLE_MS; lastActive = Date.now(); if (wasIdle && visible()) void pull(); };
    const wake = () => { if (visible()) { lastActive = Date.now(); void pull(); } };
    const refresh = () => { clearTimeout(debounce); debounce = setTimeout(() => void pull(), 250); };

    timer = setTimeout(tick, EVERY_MS);
    const opts = { passive: true } as const;
    window.addEventListener("pointerdown", touch, opts);
    window.addEventListener("keydown", touch, opts);
    window.addEventListener("scroll", touch, opts);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener(BADGES_REFRESH, refresh);
    return () => {
      stopped = true; clearTimeout(timer); clearTimeout(debounce);
      window.removeEventListener("pointerdown", touch); window.removeEventListener("keydown", touch); window.removeEventListener("scroll", touch);
      window.removeEventListener("focus", wake); document.removeEventListener("visibilitychange", wake); window.removeEventListener(BADGES_REFRESH, refresh);
    };
  }, [on]);
  return null;
}

/** Jumlah untuk satu atau beberapa penanda; `initial` dipakai sampai penyimpan terisi (dan saat render di server). */
export function useBadge(keys: BadgeKey[], initial: number): number {
  const s = useSyncExternalStore(subscribe, () => store, () => null);
  return s ? keys.reduce((n, k) => n + s[k], 0) : initial;
}

/** Muat ulang sesuatu setiap kali angka penanda berubah (mis. daftar permintaan di halaman). */
export function useOnBadgesChanged(fn: () => void) {
  useEffect(() => {
    window.addEventListener(BADGES_CHANGED, fn);
    return () => window.removeEventListener(BADGES_CHANGED, fn);
  }, [fn]);
}

/** Minta angka diambil ulang sekarang juga (dipanggil setelah pengguna menyimpan sesuatu). */
export const refreshBadges = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(BADGES_REFRESH)); };

/** Gelembung angka di menu samping dan daftar menu Profil. */
export function LiveNavBadge({ badgeKey, initial, className = "" }: { badgeKey: BadgeKey | null; initial: number; className?: string }) {
  const n = useBadge(badgeKey ? [badgeKey] : [], initial);
  if (n <= 0) return null;
  return <span className={`grid h-5 min-w-5 place-items-center rounded-full bg-[#B8860B] px-1.5 text-[11px] font-extrabold text-white ${className}`} aria-label={`${n} menunggu`}>{n > 99 ? "99+" : n}</span>;
}

/** Titik kecil di tab Profil (HP) bila ada permintaan yang menunggu di menu mana pun. */
export function LiveNavDot({ keys, initial }: { keys: BadgeKey[]; initial: number }) {
  const n = useBadge(keys, initial);
  if (n <= 0) return null;
  return <span className="absolute -right-1 -top-0.5 size-2.5 rounded-full bg-[#B8860B] ring-2 ring-white" aria-label={`${n} permintaan menunggu`} />;
}

/** Gelembung angka pada tab "Permintaan daftar" di Pengaturan. */
export function LiveTabBadge({ badgeKey, initial }: { badgeKey: BadgeKey; initial: number }) {
  const n = useBadge([badgeKey], initial);
  if (n <= 0) return null;
  return <span className="ml-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#B8860B] px-1 text-[11px] font-extrabold text-white max-md:absolute max-md:right-0.5 max-md:top-0 max-md:ml-0 max-md:h-4 max-md:min-w-4 max-md:px-1 max-md:text-[10px] max-md:ring-2 max-md:ring-white" aria-label={`${n} menunggu`}>{n > 99 ? "99+" : n}</span>;
}
