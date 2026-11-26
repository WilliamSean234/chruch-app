"use client";

import { useMemo, useState } from "react";
import { askConfirm } from "@/components/ui/Confirm";
import { btnGhost, btnPrimary, callApi, card, errMsg, inputCls } from "@/components/jadwal/api";
import { qrMatrix, qrSvgPath } from "@/lib/qr";

type Status = { eligible: boolean; enabled: boolean; enabledAt: string | null; recoveryLeft: number };
type Setup = { secretText: string; uri: string; account: string };

const eyebrow = "text-xs font-extrabold tracking-[0.07em] text-[var(--gold-ink)]";
const dateText = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

function Rule({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2.5"><span className={eyebrow}>{children}</span><span className="h-px flex-1 bg-[#e8e4d6]" /></div>;
}
function Num({ n }: { n: number }) {
  return <span className="grid size-7 flex-none place-items-center rounded-full bg-[var(--primary)] text-[13px] font-extrabold text-white" aria-hidden="true">{n}</span>;
}
const note = "rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 text-[13px] font-medium leading-relaxed text-[var(--ink-2)]";
const err = "rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-sm font-semibold text-[#a12b2b]";

/** Kode QR dari tautan otpauth. Digambar di perangkat ini; rahasianya tidak dikirim ke layanan luar. */
function Qr({ text }: { text: string }) {
  const svg = useMemo(() => { try { return qrSvgPath(qrMatrix(text), 4); } catch { return null; } }, [text]);
  if (!svg) return <p className={err}>Kode QR tidak bisa dibuat. Pakai kunci yang diketik manual di bawahnya.</p>;
  return (
    <svg viewBox={`0 0 ${svg.size} ${svg.size}`} role="img" aria-label="Kode QR untuk aplikasi autentikator" className="size-[220px] flex-none rounded-xl border border-[var(--line)] bg-white" shapeRendering="crispEdges">
      <rect width={svg.size} height={svg.size} fill="#fff" />
      <path d={svg.d} fill="#000" />
    </svg>
  );
}

/** Kode cadangan: ditampilkan sekali, disalin atau diunduh, lalu harus dikonfirmasi tersimpan. */
function RecoveryCodes({ codes, intro, onDone }: { codes: string[]; intro: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `Kode cadangan verifikasi 2 langkah\nSetiap kode hanya bisa dipakai sekali.\n\n${codes.join("\n")}\n`;
  async function copy() {
    try { await navigator.clipboard.writeText(codes.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* salin manual */ }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "kode-cadangan-2-langkah.txt" });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  return (
    <div className={`${card} flex flex-col gap-4`}>
      <Rule>KODE CADANGAN</Rule>
      <p className="text-[15px] font-extrabold">{intro}</p>
      <p className="text-sm font-medium leading-relaxed text-[var(--ink-2)]">
        Kode ini jalan masuk Anda kalau HP hilang atau rusak. Kodenya <b>hanya ditampilkan sekali ini</b>. Simpan di tempat aman yang bukan HP yang sama,
        mis. dicetak atau di pengelola kata sandi. Setiap kode hanya bisa dipakai satu kali.
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3.5 font-mono text-[15px] font-bold tracking-wider sm:grid-cols-4">
        {codes.map((c) => <span key={c} className="text-center">{c}</span>)}
      </div>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={() => void copy()} className={btnGhost}>{copied ? "Tersalin ✓" : "Salin semua"}</button>
        <button type="button" onClick={download} className={btnGhost}>Unduh sebagai berkas</button>
      </div>
      <label className="flex items-start gap-2.5 text-sm font-semibold">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 size-4" />
        Saya sudah menyimpan kode cadangan ini di tempat yang aman.
      </label>
      <button type="button" disabled={!saved} onClick={onDone} className={`${btnPrimary} self-start`}>Selesai</button>
    </div>
  );
}

export default function TwoFactorPanel({ initial }: { initial: Status }) {
  const [st, setSt] = useState<Status>(initial);
  const [phase, setPhase] = useState<"idle" | "setup" | "codes">("idle");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [codesIntro, setCodesIntro] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [action, setAction] = useState<"" | "recovery" | "disable">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  async function refresh() {
    const r = await callApi("GET", "/api/v1/me/2fa");
    if (r.ok) setSt(r.data as Status);
  }
  function reset() { setCode(""); setPassword(""); setError(""); setAction(""); }

  async function start() {
    setBusy(true); setError(""); setMsg("");
    const r = await callApi("POST", "/api/v1/me/2fa/setup");
    setBusy(false);
    if (!r.ok) return setError(errMsg(r.data));
    setSetup(r.data as Setup); setCode(""); setPhase("setup");
  }
  async function confirm() {
    setBusy(true); setError("");
    const r = await callApi("POST", "/api/v1/me/2fa/confirm", { code });
    setBusy(false);
    if (!r.ok) return setError(errMsg(r.data));
    setCodes((r.data as { recoveryCodes: string[] }).recoveryCodes);
    setCodesIntro("Verifikasi 2 langkah sudah aktif. Satu langkah terakhir: simpan kode cadangan Anda.");
    setSetup(null); reset(); setPhase("codes"); void refresh();
  }
  async function newCodes() {
    setBusy(true); setError("");
    const r = await callApi("POST", "/api/v1/me/2fa/recovery", { code });
    setBusy(false);
    if (!r.ok) return setError(errMsg(r.data));
    setCodes((r.data as { recoveryCodes: string[] }).recoveryCodes);
    setCodesIntro("Kode cadangan baru sudah dibuat. Kode yang lama tidak berlaku lagi.");
    reset(); setPhase("codes"); void refresh();
  }
  async function disable() {
    if (!(await askConfirm("Matikan verifikasi 2 langkah? Akun Anda akan kembali hanya dilindungi kata sandi.", { confirmLabel: "Matikan", danger: true }))) return;
    setBusy(true); setError("");
    const r = await callApi("POST", "/api/v1/me/2fa/disable", { password, code });
    setBusy(false);
    if (!r.ok) return setError(errMsg(r.data));
    reset(); setMsg("Verifikasi 2 langkah dimatikan."); void refresh();
  }

  if (!st.eligible) {
    return <div className={card}><p className="text-sm font-medium text-[var(--ink-2)]">Verifikasi 2 langkah tersedia untuk akun Superadmin.</p></div>;
  }

  if (phase === "codes") {
    return <RecoveryCodes codes={codes} intro={codesIntro} onDone={() => { setPhase("idle"); setCodes([]); setMsg("Selesai. Verifikasi 2 langkah aktif."); }} />;
  }

  if (phase === "setup" && setup) {
    return (
      <div className="flex flex-col gap-4">
        <div className={`${card} flex flex-col gap-4`}>
          <Rule>LANGKAH 1 · PASANG APLIKASI</Rule>
          <div className="flex items-start gap-3">
            <Num n={1} />
            <div className="flex flex-col gap-1.5 text-sm font-medium leading-relaxed">
              <span className="font-extrabold">Pasang aplikasi autentikator di HP Anda</span>
              <span className="text-[var(--ink-2)]">Gratis di Play Store atau App Store. Pilih salah satu: <b>Google Authenticator</b>, <b>Microsoft Authenticator</b>, atau <b>Authy</b>. Sudah punya salah satunya? Langsung ke langkah berikutnya.</span>
            </div>
          </div>
        </div>

        <div className={`${card} flex flex-col gap-4`}>
          <Rule>LANGKAH 2 · HUBUNGKAN AKUN INI</Rule>
          <div className="flex items-start gap-3">
            <Num n={2} />
            <span className="text-sm font-medium leading-relaxed"><span className="font-extrabold">Buka aplikasinya, tekan tanda “+”, pilih “Pindai kode QR”</span>, lalu arahkan kamera HP ke kotak ini.</span>
          </div>
          <div className="flex flex-wrap items-start gap-5">
            <Qr text={setup.uri} />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5 text-[13px] font-medium leading-relaxed text-[var(--ink-2)]">
              <span className="font-extrabold text-[var(--ink)]">Tidak bisa memindai?</span>
              <span>Di aplikasi pilih “Masukkan kunci setelan” (atau “Enter a setup key”), isi nama akun bebas, lalu ketik kunci ini. Jenisnya “Berdasarkan waktu” (Time based):</span>
              <code className="break-all rounded-lg bg-[var(--surface-2)] px-3 py-2 font-mono text-[15px] font-bold tracking-wider text-[var(--ink)]">{setup.secretText}</code>
              <span>Membuka halaman ini dari HP yang sama? <a href={setup.uri} className="font-bold text-[var(--primary-ink)] underline underline-offset-2">Buka langsung di aplikasi autentikator</a>.</span>
              <span>Jaga kunci dan kode QR ini seperti kata sandi: jangan difoto atau dikirim ke siapa pun.</span>
            </div>
          </div>
        </div>

        <div className={`${card} flex flex-col gap-4`}>
          <Rule>LANGKAH 3 · CEK KODENYA</Rule>
          <div className="flex items-start gap-3">
            <Num n={3} />
            <span className="text-sm font-medium leading-relaxed"><span className="font-extrabold">Ketik 6 angka yang sekarang tampil di aplikasi.</span> Kodenya berganti tiap 30 detik; kalau hampir habis, tunggu kode baru lalu ketik.</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" aria-label="Kode 6 angka"
              className={`${inputCls} !w-44 text-center text-lg font-extrabold tracking-[0.2em]`} />
            <button type="button" disabled={busy || code.replace(/\s/g, "").length !== 6} onClick={() => void confirm()} className={btnPrimary}>{busy ? "Memeriksa…" : "Aktifkan"}</button>
            <button type="button" disabled={busy} onClick={() => { setPhase("idle"); setSetup(null); reset(); }} className={btnGhost}>Batal</button>
          </div>
          {error && <p role="alert" className={err}>{error}</p>}
        </div>
      </div>
    );
  }

  if (!st.enabled) {
    return (
      <div className="flex flex-col gap-4">
        <div className={`${card} flex flex-col gap-3.5`}>
          <Rule>VERIFIKASI 2 LANGKAH</Rule>
          <p className="text-[15px] font-extrabold">Belum aktif</p>
          <p className="text-sm font-medium leading-relaxed text-[var(--ink-2)]">
            Akun Superadmin bisa mengubah dan menghapus hampir semua data. Dengan 2 langkah, orang yang tahu kata sandi Anda <b>tetap tidak bisa masuk</b> tanpa HP Anda.
            Setiap kali masuk Anda diminta 6 angka dari aplikasi autentikator di HP, selain kata sandi.
          </p>
          <ul className="flex flex-col gap-1.5 pl-1 text-sm font-medium text-[var(--ink-2)]">
            <li>• Pengaktifannya sekitar 3 menit dan hanya sekali.</li>
            <li>• Tiap Superadmin punya aplikasi dan kode sendiri-sendiri.</li>
            <li>• Anda akan mendapat kode cadangan kalau HP hilang.</li>
          </ul>
          <button type="button" onClick={() => void start()} disabled={busy} className={`${btnPrimary} self-start`}>{busy ? "Menyiapkan…" : "Mulai pengaktifan"}</button>
          {error && <p role="alert" className={err}>{error}</p>}
        </div>
        {msg && <p role="status" className="rounded-xl bg-[#E3F4E8] px-3.5 py-2.5 text-sm font-semibold text-[#1B6B34]">{msg}</p>}
      </div>
    );
  }

  const low = st.recoveryLeft <= 2;
  return (
    <div className="flex flex-col gap-4">
      {msg && <p role="status" className="rounded-xl bg-[#E3F4E8] px-3.5 py-2.5 text-sm font-semibold text-[#1B6B34]">{msg}</p>}
      <div className={`${card} flex flex-col gap-3.5`}>
        <Rule>VERIFIKASI 2 LANGKAH</Rule>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="whitespace-nowrap rounded-full bg-[#E3F4E8] px-3 py-1 text-[13px] font-extrabold text-[#1B6B34]">Aktif</span>
          {st.enabledAt && <span className="text-sm font-medium text-[var(--ink-2)]">sejak {dateText(st.enabledAt)}</span>}
        </div>
        <p className="text-sm font-medium text-[var(--ink-2)]">Setiap kali masuk, Anda diminta kode 6 angka dari aplikasi autentikator di HP.</p>
        <div className={`rounded-xl border px-3.5 py-3 text-sm font-medium leading-relaxed ${low ? "border-[#E7C27A] bg-[#FFFBF0] text-[#6F4304]" : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]"}`}>
          Kode cadangan tersisa: <b>{st.recoveryLeft}</b>.{low && " Hampir habis, buat yang baru supaya tidak terkunci kalau HP hilang."}
        </div>

        {action === "" && (
          <div className="flex flex-wrap gap-2.5">
            <button type="button" className={btnGhost} onClick={() => { reset(); setMsg(""); setAction("recovery"); }}>Buat kode cadangan baru</button>
            <button type="button" className="h-11 rounded-xl border border-[#F2C9C9] bg-white px-4 text-sm font-bold text-[#9B1C1C] hover:bg-[#FFF5F5]" onClick={() => { reset(); setMsg(""); setAction("disable"); }}>Matikan 2 langkah</button>
          </div>
        )}

        {action === "recovery" && (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--line)] p-4">
            <span className="text-sm font-extrabold">Buat kode cadangan baru</span>
            <span className="text-[13px] font-medium text-[var(--ink-2)]">Kode yang lama langsung tidak berlaku. Ketik kode 6 angka yang sekarang tampil di aplikasi untuk melanjutkan.</span>
            <div className="flex flex-wrap items-center gap-3">
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" aria-label="Kode 6 angka" className={`${inputCls} !w-44 text-center text-lg font-extrabold tracking-[0.2em]`} />
              <button type="button" disabled={busy || code.replace(/\s/g, "").length !== 6} onClick={() => void newCodes()} className={btnPrimary}>{busy ? "Memeriksa…" : "Buat kode baru"}</button>
              <button type="button" onClick={reset} className={btnGhost}>Batal</button>
            </div>
            {error && <p role="alert" className={err}>{error}</p>}
          </div>
        )}

        {action === "disable" && (
          <div className="flex flex-col gap-3 rounded-xl border border-[#F2C9C9] p-4">
            <span className="text-sm font-extrabold text-[#9B1C1C]">Matikan verifikasi 2 langkah</span>
            <span className="text-[13px] font-medium text-[var(--ink-2)]">Akun Anda kembali hanya dilindungi kata sandi. Isi kata sandi Anda dan satu kode (dari aplikasi, atau kode cadangan bila HP hilang).</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Kata sandi Anda" aria-label="Kata sandi" className={inputCls} />
            <div className="flex flex-wrap items-center gap-3">
              <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={12} placeholder="Kode 6 angka / cadangan" aria-label="Kode" className={`${inputCls} !w-56 text-center font-extrabold tracking-wider`} />
              <button type="button" disabled={busy || !password || code.trim().length < 6} onClick={() => void disable()} className="h-11 rounded-xl bg-[#9B1C1C] px-5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50">{busy ? "Memeriksa…" : "Matikan"}</button>
              <button type="button" onClick={reset} className={btnGhost}>Batal</button>
            </div>
            {error && <p role="alert" className={err}>{error}</p>}
          </div>
        )}
      </div>

      <div className={`${card} flex flex-col gap-2.5`}>
        <Rule>KALAU HP HILANG ATAU GANTI HP</Rule>
        <ul className="flex flex-col gap-2 text-sm font-medium leading-relaxed text-[var(--ink-2)]">
          <li><b className="text-[var(--ink)]">Masih punya kode cadangan:</b> di halaman masuk, setelah kata sandi, pilih “HP hilang? Pakai kode cadangan”. Setelah masuk, matikan 2 langkah di sini lalu aktifkan lagi di HP baru.</li>
          <li><b className="text-[var(--ink)]">Tidak punya kode cadangan:</b> minta Superadmin lain mereset 2 langkah Anda di Pengaturan &gt; Kelola akun. Itulah sebabnya sebaiknya ada minimal dua Superadmin.</li>
          <li><b className="text-[var(--ink)]">Kode ditolak terus:</b> pastikan tanggal dan jam HP diatur otomatis. Jam yang meleset membuat kode tidak cocok.</li>
        </ul>
      </div>
    </div>
  );
}
