"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * Kartu "Pasang di HP" (hanya tampil di HP, dan hanya bila aplikasi belum dipasang).
 * Android/Chrome: tombol Pasang. iPhone/iPad: petunjuk "Tambah ke Layar Utama" karena Safari tidak punya tombol pasang.
 */
export default function InstallApp() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(true); // anggap sudah terpasang sampai terbukti belum (hindari kedipan)
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const ua = navigator.userAgent;
    setIos(/iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1));
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setEvt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed || (!evt && !ios)) return null;

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-[#D0D3E8] bg-[#F1F2FD] p-4 md:hidden">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="size-11 flex-none rounded-xl" />
        <div className="flex min-w-0 flex-col">
          <span className="text-[15px] font-extrabold">Pasang di layar utama HP</span>
          <span className="text-[13px] font-medium text-[var(--ink-2)]">Buka seperti aplikasi biasa, tanpa mengetik alamat.</span>
        </div>
      </div>
      {evt ? (
        <button type="button" onClick={async () => { await evt.prompt(); await evt.userChoice.catch(() => null); setEvt(null); }}
          className="h-11 rounded-xl bg-[var(--primary)] text-sm font-bold text-white active:brightness-110">Pasang aplikasi</button>
      ) : (
        <>
          <button type="button" onClick={() => setHelp((v) => !v)} aria-expanded={help}
            className="h-11 rounded-xl border border-[#D0D3E8] bg-white text-sm font-bold text-[var(--primary-ink)] active:bg-[#f3f4f9]">{help ? "Tutup petunjuk" : "Lihat caranya"}</button>
          {help && (
            <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-[13.5px] font-medium leading-relaxed text-[var(--ink-2)]">
              <li>Buka halaman ini lewat <b className="text-[var(--ink)]">Safari</b>.</li>
              <li>Ketuk ikon <b className="text-[var(--ink)]">Bagikan</b> (kotak dengan panah ke atas) di bilah Safari.</li>
              <li>Pilih <b className="text-[var(--ink)]">Tambah ke Layar Utama</b>, lalu ketuk <b className="text-[var(--ink)]">Tambah</b>.</li>
            </ol>
          )}
        </>
      )}
    </section>
  );
}
