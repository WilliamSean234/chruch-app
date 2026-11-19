"use client";

import { useEffect } from "react";

/** Mendaftarkan service worker (hanya di produksi supaya mode pengembangan tidak ikut ter-cache). */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => { /* tanpa service worker aplikasi tetap jalan seperti biasa */ });
  }, []);
  return null;
}
