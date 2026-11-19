"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { callApi, errMsg } from "@/components/jadwal/api";
import PasswordRules from "@/components/ui/PasswordRules";
import { PASSWORD_MIN } from "@/lib/passwordRules";

const input = "h-12 rounded-xl border border-[var(--line)] px-4 text-[15px] font-medium";

/** Ganti kata sandi. `forced` = login pertama (atau habis direset admin): wajib diselesaikan sebelum masuk aplikasi. */
export default function ChangePasswordForm({ email, forced }: { email: string; forced: boolean }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [nextPw, setNextPw] = useState("");
  const [againPw, setAgainPw] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cur = String(f.get("current") ?? "");
    const next = String(f.get("next") ?? "");
    const again = String(f.get("again") ?? "");
    if (next.length < PASSWORD_MIN) return setError(`Kata sandi baru minimal ${PASSWORD_MIN} karakter.`);
    if (next !== again) return setError("Kata sandi baru dan konfirmasinya tidak sama.");
    if (next === cur) return setError("Kata sandi baru harus berbeda dari yang lama.");
    setBusy(true); setError("");
    const r = await callApi("POST", "/api/v1/me/password", { currentPassword: cur, newPassword: next });
    if (!r.ok) { setBusy(false); return setError(r.data?.error?.code === "VALIDATION" ? "Periksa isian. Kata sandi baru minimal 8 karakter." : errMsg(r.data)); }
    // Masuk ulang diam-diam dengan kata sandi baru supaya sesi memuat status terbaru.
    const res = await signIn("credentials", { email, password: next, redirect: false });
    setBusy(false);
    if (res?.error) window.location.href = "/login";
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
        <h1 className="text-2xl font-extrabold tracking-tight">{forced ? "Buat kata sandi baru" : "Ganti kata sandi"}</h1>
        <div className="mb-4 mt-2 h-0.5 w-7 rounded bg-[var(--gold)]" aria-hidden="true" />
        <p className="mb-5 text-sm font-medium leading-relaxed text-[var(--ink-2)]">
          {forced ? "Ini pertama kali Anda masuk. Demi keamanan, ganti kata sandi awal dari admin dengan kata sandi buatan Anda sendiri." : `Akun: ${email}`}
        </p>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-bold">{forced ? "Kata sandi awal (dari admin)" : "Kata sandi saat ini"}
            <input name="current" type="password" required autoComplete="current-password" className={input} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold">Kata sandi baru
            <input name="next" type="password" required autoComplete="new-password" className={input} value={nextPw} onChange={(e) => setNextPw(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold">Ulangi kata sandi baru
            <input name="again" type="password" required autoComplete="new-password" className={input} value={againPw} onChange={(e) => setAgainPw(e.target.value)} />
          </label>
          <PasswordRules value={nextPw} confirm={againPw} />
          {error && <p role="alert" className="text-sm font-semibold text-[#9B1C1C]">{error}</p>}
          <button disabled={busy} className="mt-2 h-12 rounded-xl bg-[var(--primary)] text-[15px] font-bold text-white hover:brightness-110 disabled:opacity-60">{busy ? "Menyimpan…" : "Simpan kata sandi"}</button>
          {forced ? (
            <button type="button" onClick={() => void signOut({ callbackUrl: "/login" })} className="h-10 rounded-xl text-[13px] font-bold text-[var(--ink-2)] hover:bg-[#ecedf8]">Keluar</button>
          ) : (
            <Link href="/" className="grid h-10 place-items-center rounded-xl text-[13px] font-bold text-[var(--ink-2)] hover:bg-[#ecedf8]">Batal</Link>
          )}
        </form>
      </div>
    </main>
  );
}
