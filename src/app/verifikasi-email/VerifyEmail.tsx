"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { callApi, errMsg } from "@/components/jadwal/api";
import BrandMark from "@/components/ui/BrandMark";

type State = { kind: "loading" } | { kind: "ok"; email: string; reg: boolean } | { kind: "error"; message: string };

/** Halaman publik tujuan tautan di email. Token dipakai lewat permintaan dari halaman ini supaya pemindai tautan di kotak surat tidak menghabiskannya. */
export default function VerifyEmail({ token }: { token: string }) {
  const [s, setS] = useState<State>(token ? { kind: "loading" } : { kind: "error", message: "Tautan verifikasi tidak lengkap." });

  useEffect(() => {
    if (!token) return;
    let live = true;
    void callApi("POST", "/api/v1/auth/verify-email", { token }).then((r) => {
      if (!live) return;
      setS(r.ok ? { kind: "ok", email: r.data.email, reg: r.data.kind === "REGISTRATION" } : { kind: "error", message: errMsg(r.data) });
    });
    return () => { live = false; };
  }, [token]);

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm rounded-[24px] border border-[var(--line)] bg-white p-8 max-md:p-6">
        <div className="mb-6 flex items-center gap-3"><BrandMark /><span className="text-[19px] font-extrabold tracking-tight">Pelayanan</span></div>
        {s.kind === "loading" && <p className="text-sm font-semibold text-[var(--ink-2)]">Memverifikasi email…</p>}
        {s.kind === "ok" && (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-extrabold tracking-tight">Email terverifikasi</h1>
            <p className="text-sm font-medium leading-relaxed text-[var(--ink-2)]">
              <b className="break-all text-[var(--ink)]">{s.email}</b> sudah terbukti milik Anda.
              {s.reg ? " Permintaan daftar Anda sekarang bisa diproses admin gereja. Anda belum bisa masuk sampai disetujui." : " Pesan jadwal bisa dikirim ke email ini bila notifikasi HP belum aktif."}
            </p>
            <Link href="/login" className="grid h-12 place-items-center rounded-xl bg-[var(--primary)] text-[15px] font-bold text-white hover:brightness-110">Ke halaman masuk</Link>
          </div>
        )}
        {s.kind === "error" && (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-extrabold tracking-tight">Tidak bisa memverifikasi</h1>
            <p role="alert" className="text-sm font-medium leading-relaxed text-[#9B1C1C]">{s.message}</p>
            <Link href="/login" className="grid h-12 place-items-center rounded-xl border border-[#D0D3E8] bg-white text-[15px] font-bold text-[var(--primary-ink)]">Ke halaman masuk</Link>
          </div>
        )}
      </div>
    </main>
  );
}
