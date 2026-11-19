"use client";

import { useState } from "react";
import { btnGhost, inputCls } from "@/components/jadwal/api";

const PW_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
/** Kata sandi acak 10 karakter tanpa huruf yang mudah tertukar (0/O, 1/l/I). */
export const genPassword = () => Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => PW_CHARS[n % PW_CHARS.length]).join("");

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; /* pengguna bisa menyalin manual */ }
}

/**
 * Isian kata sandi awal / sementara yang seragam di seluruh aplikasi: terisi acak, terlihat (bukan titik-titik),
 * bisa diacak ulang, disalin, dan diketik sendiri. Dipakai di buat akun, reset di Orang, dan reset di Kelola akun.
 */
export default function PasswordField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5 text-[13px] font-bold">
      <label htmlFor="pw-field">{label}</label>
      <div className="flex gap-2">
        <input id="pw-field" className={`${inputCls} font-mono`} value={value} onChange={(e) => { onChange(e.target.value); setCopied(false); }} autoComplete="off" spellCheck={false} />
        <button type="button" className={btnGhost} onClick={() => { onChange(genPassword()); setCopied(false); }}>Acak</button>
        <button type="button" className={btnGhost} onClick={async () => setCopied(await copyText(value))} disabled={!value}>{copied ? "Tersalin ✓" : "Salin"}</button>
      </div>
      <span className="text-xs font-medium text-[var(--ink-2)]">{hint}</span>
    </div>
  );
}

/** Kotak "catat sekarang" setelah kata sandi dibuat/direset: kata sandi tidak bisa dilihat lagi setelahnya. */
export function IssuedPassword({ email, password }: { email?: string; password: string }) {
  const [copied, setCopied] = useState<"pw" | "both" | null>(null);
  return (
    <div className="rounded-2xl border border-[#E7C27A] bg-[var(--gold-soft)] p-4">
      <p className="text-sm font-semibold text-[var(--gold-ink)]">Catat sekarang, kata sandi tidak bisa dilihat lagi setelah ini.</p>
      {email && <p className="mt-2 text-sm font-semibold">{email}</p>}
      <p className="mt-1 font-mono text-lg font-extrabold">{password}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={btnGhost} onClick={async () => setCopied((await copyText(password)) ? "pw" : null)}>{copied === "pw" ? "Tersalin ✓" : "Salin kata sandi"}</button>
        {email && <button type="button" className={btnGhost} onClick={async () => setCopied((await copyText(`Email: ${email}\nKata sandi: ${password}`)) ? "both" : null)}>{copied === "both" ? "Tersalin ✓" : "Salin email & kata sandi"}</button>}
      </div>
    </div>
  );
}
