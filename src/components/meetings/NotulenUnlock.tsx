"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Modal, { Field } from "@/components/master/Modal";
import { askConfirm } from "@/components/ui/Confirm";
import { showToast } from "@/components/ui/Toast";
import { btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";

const UNLOCK_URL = "/api/v1/auth/notulen-unlock";

const LockIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
);

/** Isian kata sandi. Pesan galat tampil di bawah isian (bukan popup bawaan browser). */
function UnlockForm({ onUnlocked, label = "Buka notulen" }: { onUnlocked: () => void; label?: string }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw) { setError("Masukkan kata sandi Anda."); return; }
    setBusy(true); setError("");
    const r = await callApi("POST", UNLOCK_URL, { password: pw });
    setBusy(false);
    if (r.ok) { setPw(""); onUnlocked(); } else { setError(errMsg(r.data)); }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Kata sandi akun Anda">
        <input type="password" autoComplete="current-password" autoFocus value={pw} onChange={(e) => { setPw(e.target.value); setError(""); }} className={inputCls} aria-invalid={!!error} />
      </Field>
      {error && <p role="alert" className="m-0 text-[13px] font-bold text-[#9B1C1C]">{error}</p>}
      <button type="submit" disabled={busy} className={`${btnPrimary} self-start`}>{busy ? "Memeriksa…" : label}</button>
    </form>
  );
}

/** Pengganti isi halaman notulen selama notulen masih terkunci. */
export function NotulenGate({ backHref }: { backHref: string }) {
  const router = useRouter();
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4 rounded-[20px] border border-[var(--line)] bg-white p-6">
      <span className="grid size-11 place-items-center rounded-full bg-[var(--primary-soft)] text-[var(--primary-ink)]"><LockIcon size={22} /></span>
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-lg font-extrabold">Notulen dikunci</h2>
        <p className="m-0 text-[13.5px] font-medium leading-relaxed text-[var(--ink-2)]">
          Masukkan kata sandi akun Anda untuk membuka notulen. Ini menjaga notulen tetap tertutup bila HP atau komputer Anda dipinjam orang lain.
          Setelah dibuka, notulen tetap terbuka sekitar 1 jam.
        </p>
      </div>
      <UnlockForm onUnlocked={() => router.refresh()} />
      <Link href={backHref} className="self-start text-[13px] font-bold text-[var(--primary-ink)] hover:underline">← Kembali ke rapat</Link>
    </div>
  );
}

const clock = (ms: number) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms)).replace(".", ":");

/** Baris kecil di atas notulen yang terbuka: sampai kapan terbuka, dan tombol untuk mengunci sekarang. */
export function NotulenLockBar({ until }: { until: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function lockNow() {
    if (!(await askConfirm("Kunci notulen sekarang? Isian yang belum disimpan akan hilang.", { confirmLabel: "Kunci" }))) return;
    setBusy(true);
    const r = await callApi("DELETE", UNLOCK_URL);
    setBusy(false);
    if (r.ok) { showToast("Notulen dikunci."); router.refresh(); } else showToast(errMsg(r.data), "error");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--bg)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-2)]">
      <span className="flex items-center gap-1.5"><LockIcon size={14} />Notulen terbuka sampai {clock(until)} WIB.</span>
      <button type="button" onClick={lockNow} disabled={busy} className="font-bold text-[var(--primary-ink)] hover:underline disabled:opacity-50">Kunci sekarang</button>
    </div>
  );
}

/**
 * Dialog kata sandi untuk waktu buka yang habis di tengah pekerjaan (mis. saat menyimpan draf): isian di layar tidak hilang.
 * `ask()` membuka dialog dan mengembalikan true bila kata sandi benar, false bila ditutup.
 */
export function useUnlockPrompt() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const ask = useCallback(() => new Promise<boolean>((resolve) => { resolver.current = resolve; setOpen(true); }), []);
  const done = (ok: boolean) => { setOpen(false); resolver.current?.(ok); resolver.current = null; };
  const dialog = open ? (
    <Modal title="Masukkan kata sandi" onClose={() => done(false)}>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-[13.5px] font-medium leading-relaxed text-[var(--ink-2)]">Waktu buka notulen sudah habis. Masukkan kata sandi untuk melanjutkan; isian Anda di layar tidak hilang.</p>
        <UnlockForm onUnlocked={() => done(true)} label="Lanjutkan" />
      </div>
    </Modal>
  ) : null;
  return { ask, dialog };
}
