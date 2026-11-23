"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { askConfirm } from "@/components/ui/Confirm";

const THRESHOLD = 70; // jarak tarik (px, setelah diredam) agar lepas = muat ulang
const MAX_PULL = 110;
const RESIST = 0.5;

/** Elemen (atau induknya) yang sedang tergulir ke bawah: tarikan di sana adalah gulir biasa, bukan muat ulang. */
function scrolledInside(el: Element | null): boolean {
  for (let n: Element | null = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight && n.scrollTop > 0) return true;
  }
  return false;
}

/**
 * Tarik layar ke bawah dari paling atas untuk memuat ulang halaman, dengan penanda di atas layar. Hanya di HP.
 * Tidak aktif saat ada popup terbuka atau tarikan dimulai dari kolom isian. Bila sudah ada isian yang diketik,
 * ditanya dulu agar ketikan tidak hilang.
 */
export default function PullToRefresh() {
  const pathname = usePathname();
  const [pull, setPull] = useState(0);
  const [loading, setLoading] = useState(false);
  const typed = useRef(false);

  useEffect(() => { typed.current = false; }, [pathname]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    let startY = 0, startX = 0, active = false, dist = 0, busy = false;

    const onInput = () => { typed.current = true; };
    const onStart = (e: TouchEvent) => {
      active = false; dist = 0;
      if (!mobile.matches || busy || e.touches.length !== 1 || window.scrollY > 0) return;
      const t = e.target as Element | null;
      if (t?.closest("input, textarea, select, [role=dialog], [aria-modal=true], .fixed")) return;
      if (scrolledInside(t)) return;
      startY = e.touches[0]!.clientY; startX = e.touches[0]!.clientX; active = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!active) return;
      const dy = e.touches[0]!.clientY - startY, dx = e.touches[0]!.clientX - startX;
      if (dy <= 0 || window.scrollY > 0 || Math.abs(dx) > Math.abs(dy)) { if (dist > 0) { dist = 0; setPull(0); } if (dy <= 0) active = false; return; }
      if (e.cancelable) e.preventDefault(); // cegah pantulan atau muat ulang bawaan browser
      dist = Math.min(dy * RESIST, MAX_PULL);
      setPull(dist);
    };
    const onEnd = async () => {
      if (!active) return;
      active = false;
      const reached = dist >= THRESHOLD;
      dist = 0;
      if (!reached) { setPull(0); return; }
      if (typed.current && !(await askConfirm("Ada isian yang sudah diketik dan belum disimpan. Muat ulang halaman dan buang isian itu?", { danger: true, confirmLabel: "Muat ulang", cancelLabel: "Batal", title: "Muat ulang halaman" }))) { setPull(0); return; }
      busy = true; setLoading(true); setPull(THRESHOLD * 0.8);
      setTimeout(() => window.location.reload(), 350); // beri waktu penanda terlihat
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
    document.addEventListener("input", onInput, true);
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      document.removeEventListener("input", onInput, true);
    };
  }, []);

  if (pull <= 0 && !loading) return null;
  const ready = pull >= THRESHOLD;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex flex-col items-center md:hidden" style={{ transform: `translateY(${Math.max(pull - 36, -36)}px)`, paddingTop: "env(safe-area-inset-top)", transition: pull === 0 || loading ? "transform 0.2s" : "none" }} aria-hidden="true">
      <span className="grid size-10 place-items-center rounded-full border border-[var(--line)] bg-white shadow-md">
        {loading ? (
          <svg className="size-5 animate-spin text-[var(--primary)]" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
        ) : (
          <svg className="size-5 text-[var(--primary)] transition-transform" style={{ transform: `rotate(${ready ? 180 : 0}deg)` }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
        )}
      </span>
      <span className="mt-1 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-bold text-[var(--ink-2)] shadow-sm">{loading ? "Memuat…" : ready ? "Lepas untuk memuat ulang" : "Tarik untuk memuat ulang"}</span>
    </div>
  );
}
