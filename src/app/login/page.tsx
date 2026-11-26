"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import BrandMark from "@/components/ui/BrandMark";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Akun dengan verifikasi 2 langkah: setelah email dan kata sandi benar, diminta kode dari aplikasi autentikator.
  const [step, setStep] = useState<"login" | "code">("login");
  const [creds, setCreds] = useState({ email: "", password: "" });
  const [recovery, setRecovery] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const email = step === "login" ? String(f.get("email") ?? "") : creds.email;
    const password = step === "login" ? String(f.get("password") ?? "") : creds.password;
    const code = step === "code" ? String(f.get("code") ?? "").trim() : "";
    const res = await signIn("credentials", { email, password, ...(code ? { code } : {}), redirect: false });
    setBusy(false);
    const locked = /^locked\.(\d+)$/.exec(res?.code ?? "");
    if (locked) setError(`Terlalu banyak percobaan masuk. Coba lagi dalam ${locked[1]} menit.`);
    else if (res?.code === "2fa_required") { setCreds({ email, password }); setStep("code"); setRecovery(false); }
    else if (res?.code === "2fa_invalid") setError(recovery ? "Kode cadangan salah atau sudah pernah dipakai." : "Kode salah atau sudah kedaluwarsa. Kode berganti tiap 30 detik: tunggu kode baru muncul lalu coba lagi. Pastikan jam HP Anda diatur otomatis.");
    else if (res?.error) { setStep("login"); setError("Email atau kata sandi salah."); }
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
          <BrandMark />
          <div className="flex flex-col leading-[1.15]">
            <span className="text-[19px] font-extrabold tracking-tight">Pelayanan</span>
            <span className="text-[13px] font-medium text-[var(--ink-2)]">Penjadwalan gereja</span>
          </div>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight">{step === "code" ? "Verifikasi 2 langkah" : "Masuk"}</h1>
        <div className="mb-5 mt-2 h-0.5 w-7 rounded bg-[var(--gold)]" aria-hidden="true" />
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {step === "login" ? (
            <>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold">Email
                <input name="email" type="email" required autoComplete="username" className="h-12 rounded-xl border border-[var(--line)] px-4 text-[15px] font-medium" />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold">Kata sandi
                <input name="password" type="password" required autoComplete="current-password" className="h-12 rounded-xl border border-[var(--line)] px-4 text-[15px] font-medium" />
              </label>
            </>
          ) : (
            <>
              <p className="text-sm font-medium leading-relaxed text-[var(--ink-2)]">
                {recovery
                  ? "Ketik salah satu kode cadangan yang Anda simpan saat mengaktifkan 2 langkah. Tiap kode hanya bisa dipakai sekali."
                  : "Kata sandi benar. Sekarang buka aplikasi autentikator di HP Anda (mis. Google Authenticator), lalu ketik 6 angka yang tampil untuk akun ini."}
              </p>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold">{recovery ? "Kode cadangan" : "Kode 6 angka"}
                <input key={recovery ? "r" : "t"} name="code" required autoFocus autoComplete="one-time-code" inputMode={recovery ? "text" : "numeric"} maxLength={recovery ? 12 : 7}
                  placeholder={recovery ? "XXXXX-XXXXX" : "123456"} className="h-12 rounded-xl border border-[var(--line)] px-4 text-center text-xl font-extrabold tracking-[0.2em]" />
              </label>
              <button type="button" onClick={() => { setRecovery((v) => !v); setError(""); }} className="self-start text-[13px] font-bold text-[var(--primary-ink)] underline underline-offset-2">
                {recovery ? "Pakai kode dari aplikasi" : "HP hilang? Pakai kode cadangan"}
              </button>
            </>
          )}
          {error && (
            <div role="alert" className="flex flex-col gap-1">
              <p className="text-sm font-semibold text-[#9B1C1C]">{error}</p>
              {error.startsWith("Email atau") && <p className="text-xs font-medium text-[var(--ink-2)]">Baru mendaftar? Akun baru bisa dipakai setelah disetujui admin.</p>}
            </div>
          )}
          <button disabled={busy} className="mt-2 h-12 rounded-xl bg-[var(--primary)] text-[15px] font-bold text-white hover:brightness-110 disabled:opacity-60">{busy ? "Memeriksa…" : step === "code" ? "Verifikasi dan masuk" : "Masuk"}</button>
          {step === "code"
            ? <button type="button" onClick={() => { setStep("login"); setError(""); setCreds({ email: "", password: "" }); }} className="text-center text-[13px] font-bold text-[var(--ink-2)] hover:underline">‹ Kembali</button>
            : <p className="mt-1 text-center text-[13px] font-medium text-[var(--ink-2)]">Belum punya akun? <Link href="/daftar" className="font-bold text-[var(--primary-ink)] underline underline-offset-2">Daftar</Link></p>}
        </form>
      </div>
    </main>
  );
}
