"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const res = await signIn("credentials", { email: f.get("email"), password: f.get("password"), redirect: false });
    setBusy(false);
    const locked = /^locked\.(\d+)$/.exec(res?.code ?? "");
    if (locked) setError(`Terlalu banyak percobaan masuk. Coba lagi dalam ${locked[1]} menit.`);
    else if (res?.error) setError("Email atau kata sandi salah.");
    else window.location.href = "/";
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden p-6">
      <svg className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 opacity-70" width="560" height="420" viewBox="0 0 300 230" fill="none" aria-hidden="true">
        <path d="M40 230V120C40 66 80 30 150 30s110 36 110 90v110" stroke="#E7C27A" strokeWidth="1" />
        <path d="M80 230V125c0-38 28-62 70-62s70 24 70 62v105" stroke="#E7C27A" strokeWidth="1" opacity="0.8" />
        <path d="M118 230v-98c0-20 14-34 32-34s32 14 32 34v98" stroke="#E7C27A" strokeWidth="1" opacity="0.6" />
      </svg>
      <div className="relative w-full max-w-sm rounded-[24px] border border-[var(--line)] bg-white p-8 shadow-[0_20px_60px_-30px_rgba(48,55,168,0.35)]">
        <div className="mb-6 flex items-center gap-3">
          <svg width="34" height="40" viewBox="0 0 34 40" fill="none" aria-hidden="true">
            <path d="M2 40V17C2 8 8.5 2 17 2s15 6 15 15v23z" fill="#3037A8" />
            <path d="M17 12v18M10.5 18h13" stroke="#E7C27A" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[19px] font-extrabold tracking-tight">Pelayanan</span>
            <span className="text-[13px] font-medium text-[var(--ink-2)]">Penjadwalan gereja</span>
          </div>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">Masuk</h1>
        <div className="mb-5 mt-2 h-0.5 w-7 rounded bg-[var(--gold)]" aria-hidden="true" />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-bold">Email
            <input name="email" type="email" required autoComplete="username" className="h-12 rounded-xl border border-[var(--line)] px-4 text-[15px] font-medium" />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold">Kata sandi
            <input name="password" type="password" required autoComplete="current-password" className="h-12 rounded-xl border border-[var(--line)] px-4 text-[15px] font-medium" />
          </label>
          {error && <p role="alert" className="text-sm font-semibold text-[#9B1C1C]">{error}</p>}
          <button disabled={busy} className="mt-2 h-12 rounded-xl bg-[var(--primary)] text-[15px] font-bold text-white hover:brightness-110 disabled:opacity-60">{busy ? "Memeriksa…" : "Masuk"}</button>
        </form>
      </div>
    </main>
  );
}
