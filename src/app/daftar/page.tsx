"use client";

import Link from "next/link";
import { useState } from "react";
import { callApi, errMsg } from "@/components/jadwal/api";
import PasswordRules, { Rule } from "@/components/ui/PasswordRules";
import { isEmail, PASSWORD_MIN } from "@/lib/passwordRules";

const input = "h-12 w-full rounded-xl border border-[var(--line)] px-4 text-[15px] font-medium";

/** Halaman publik: mengirim permintaan daftar akun. Akun baru aktif setelah admin menyetujui. */
export default function DaftarPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [trap, setTrap] = useState(""); // kolom jebakan untuk pengisi otomatis
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const emailOk = isEmail(email);
  const nameOk = name.trim().length >= 2;
  const pwOk = pw.length >= PASSWORD_MIN;
  const sameOk = pw.length > 0 && pw === again;
  const ready = nameOk && emailOk && pwOk && sameOk;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) { setEmailTouched(true); return setError("Lengkapi isian dulu. Syarat yang belum hijau perlu dipenuhi."); }
    setBusy(true); setError("");
    const r = await callApi("POST", "/api/v1/auth/register", { name: name.trim(), email: email.trim(), password: pw, website: trap });
    setBusy(false);
    if (r.ok) return setSent(true);
    setError(r.data?.error?.code === "VALIDATION" ? "Periksa isian: email harus benar dan kata sandi minimal 8 karakter." : errMsg(r.data));
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden p-6">
      <svg className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 opacity-70" width="560" height="420" viewBox="0 0 300 230" fill="none" aria-hidden="true">
        <path d="M40 230V120C40 66 80 30 150 30s110 36 110 90v110" stroke="#E7C27A" strokeWidth="1" />
        <path d="M80 230V125c0-38 28-62 70-62s70 24 70 62v105" stroke="#E7C27A" strokeWidth="1" opacity="0.8" />
        <path d="M118 230v-98c0-20 14-34 32-34s32 14 32 34v98" stroke="#E7C27A" strokeWidth="1" opacity="0.6" />
      </svg>
      <div className="relative w-full max-w-sm rounded-[24px] border border-[var(--line)] bg-white p-8 shadow-[0_20px_60px_-30px_rgba(48,55,168,0.35)] max-md:p-6">
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

        {sent ? (
          <div className="flex flex-col gap-4">
            <h1 className="text-2xl font-extrabold tracking-tight">Permintaan terkirim</h1>
            <div className="h-0.5 w-7 rounded bg-[var(--gold)]" aria-hidden="true" />
            <p className="text-sm font-medium leading-relaxed text-[var(--ink-2)]">
              Admin gereja akan memeriksa permintaan Anda dan menautkannya ke data jemaat. Anda <b className="text-[var(--ink)]">belum bisa masuk</b> sampai disetujui.
              Setelah itu, masuk dengan email <b className="break-all text-[var(--ink)]">{email.trim().toLowerCase()}</b> dan kata sandi yang baru Anda buat.
            </p>
            <Link href="/login" className="grid h-12 place-items-center rounded-xl bg-[var(--primary)] text-[15px] font-bold text-white hover:brightness-110">Kembali ke halaman masuk</Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight">Daftar</h1>
            <div className="mb-2 mt-2 h-0.5 w-7 rounded bg-[var(--gold)]" aria-hidden="true" />
            <p className="mb-4 text-[13px] font-medium leading-relaxed text-[var(--ink-2)]">Akun aktif setelah disetujui admin gereja.</p>
            <form onSubmit={onSubmit} className="flex flex-col gap-3.5" noValidate>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold">Nama lengkap
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} className={input} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold">Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => setEmailTouched(true)} autoComplete="email" inputMode="email" maxLength={120}
                  aria-invalid={emailTouched && email.length > 0 && !emailOk} className={`${input} ${emailTouched && email.length > 0 && !emailOk ? "!border-[#C94B4B]" : ""}`} placeholder="nama@contoh.com" />
                {email.length > 0 && (emailOk || emailTouched) && (
                  <ul className="m-0 list-none p-0"><Rule ok={emailOk}>{emailOk ? "Format email benar" : "Format email belum benar, contoh: nama@contoh.com"}</Rule></ul>
                )}
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold">Kata sandi
                <div className="relative">
                  <input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" maxLength={100} className={`${input} pr-20`} />
                  <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} className="absolute inset-y-1.5 right-1.5 rounded-lg px-3 text-[12.5px] font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">{show ? "Sembunyikan" : "Tampilkan"}</button>
                </div>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold">Ulangi kata sandi
                <input type={show ? "text" : "password"} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" maxLength={100} className={input} />
              </label>
              <PasswordRules value={pw} confirm={again} />
              {/* kolom jebakan: tersembunyi dari manusia dan pembaca layar */}
              <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
                <label>Situs web<input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} /></label>
              </div>
              {error && <p role="alert" className="text-sm font-semibold text-[#9B1C1C]">{error}</p>}
              <button disabled={busy || !ready} className="mt-1 h-12 rounded-xl bg-[var(--primary)] text-[15px] font-bold text-white hover:brightness-110 disabled:opacity-50">{busy ? "Mengirim…" : "Kirim permintaan"}</button>
              <p className="text-center text-[13px] font-medium text-[var(--ink-2)]">Sudah punya akun? <Link href="/login" className="font-bold text-[var(--primary-ink)] underline underline-offset-2">Masuk</Link></p>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
