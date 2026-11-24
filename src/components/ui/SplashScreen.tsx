"use client";

import { useEffect, useState } from "react";
import { SPLASH_KEY } from "@/lib/ui";

const TITLE = "Pelayanan";
// titik-titik cahaya yang naik pelan: [kiri %, ukuran px, jeda detik, lama detik]
const SPARKS: [number, number, number, number][] = [[18, 5, 0.9, 2.6], [30, 3, 1.3, 2.2], [42, 4, 0.6, 2.8], [58, 3, 1.5, 2.3], [70, 5, 1.0, 2.7], [82, 4, 1.7, 2.1], [50, 3, 2.0, 2.0], [24, 3, 2.1, 1.9]];

/**
 * Layar pembuka: lambang gereja tergambar garis demi garis, lingkaran cahaya mengembang, lalu nama aplikasi naik huruf demi huruf.
 * Seluruh gerakan murni CSS (globals.css, .splash*) dan layar menghilang sendiri lewat CSS, jadi tidak pernah menutupi halaman
 * walau JavaScript gagal. Ketuk di mana saja untuk melewati. Mengikuti pengaturan "kurangi gerakan".
 */
export default function SplashScreen() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (document.documentElement.dataset.splash === "off") { setGone(true); return; }
    try { sessionStorage.setItem(SPLASH_KEY, "1"); } catch { /* tanpa penyimpanan, layar tampil lagi di muat ulang berikutnya; tidak apa-apa */ }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setGone(true), reduced ? 1400 : 3100);
    return () => window.clearTimeout(t);
  }, []);

  if (gone) return null;
  return (
    <div className="splash" aria-hidden="true" onClick={() => setGone(true)}>
      <div className="splash-glow" />
      <div className="splash-stage">
        <span className="splash-ring" style={{ animationDelay: "0s" }} />
        <span className="splash-ring" style={{ animationDelay: "0.55s" }} />
        <span className="splash-ring" style={{ animationDelay: "1.1s" }} />
        {SPARKS.map(([left, size, delay, dur], i) => (
          <span key={i} className="splash-spark" style={{ left: `${left}%`, width: size, height: size, animationDelay: `${delay}s`, animationDuration: `${dur}s` }} />
        ))}
        <svg className="splash-emblem" viewBox="0 0 34 42" width="124" height="152" fill="none">
          <path className="splash-fill" d="M2 40V17C2 8 8.5 2 17 2s15 6 15 15v23z" fill="#fff" />
          <path className="splash-draw" pathLength="1" d="M2 40V17C2 8 8.5 2 17 2s15 6 15 15v23z" stroke="#f0d28a" strokeWidth="1.4" strokeLinejoin="round" />
          <path className="splash-cross" pathLength="1" d="M17 12v18M10.5 18h13" stroke="#3037a8" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </div>
      <div className="splash-text">
        <p className="splash-title">
          {TITLE.split("").map((ch, i) => <span key={i} style={{ "--i": i } as React.CSSProperties}>{ch}</span>)}
        </p>
        <p className="splash-tag">Penjadwalan gereja</p>
        <span className="splash-bar"><i /></span>
      </div>
    </div>
  );
}
