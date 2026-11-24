"use client";

import { useRef, useState } from "react";
import { CompactList, CompactRow, Detail, useOpenRows } from "@/components/ui/CompactList";
import { btnGhost, btnPrimary, card } from "@/components/jadwal/api";

type SheetResult = { key: string; label: string; found: boolean; total: number; created: number; skipped: number; errors: { row: number; message: string }[]; notes: { row: number; message: string }[] };
type Credential = { name: string; email: string; password: string; role: string };
type Result = { mode: "preview" | "apply"; ok: boolean; fatal?: string; sheets: SheetResult[]; credentials: Credential[]; unknownSheets: string[]; retiredSheets?: string[]; source?: "kuesioner"; notes?: string[] };

export default function ImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "apply">("");
  const [res, setRes] = useState<Result | null>(null);
  const [fail, setFail] = useState("");
  const [agree, setAgree] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const credRows = useOpenRows(); // HP: baris kata sandi yang dibuka
  const input = useRef<HTMLInputElement>(null);

  async function send(mode: "preview" | "apply") {
    if (!file) return;
    setBusy(mode); setFail(""); if (mode === "preview") { setRes(null); setAgree(false); }
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("mode", mode);
      const r = await fetch("/api/v1/import", { method: "POST", body: fd, cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) setFail(d?.error?.message ?? "Gagal memproses file. Coba lagi.");
      else { setRes(d as Result); if (mode === "apply") setFile(null); if (input.current) input.current.value = ""; }
    } catch { setFail("Koneksi terputus. Coba lagi."); }
    setBusy("");
  }

  const found = res?.sheets.filter((s) => s.found) ?? [];
  const totalErr = found.reduce((n, s) => n + s.errors.length, 0);
  const totalNew = found.reduce((n, s) => n + s.created, 0);
  const done = res?.mode === "apply";
  const toggle = (key: string) => setOpen((p) => { const n = new Set(p); if (n.has(key)) n.delete(key); else n.add(key); return n; });

  const copyAll = () => navigator.clipboard?.writeText(["Nama\tEmail\tKata sandi sementara\tRole", ...(res?.credentials ?? []).map((c) => `${c.name}\t${c.email}\t${c.password}\t${c.role}`)].join("\n"));
  const csv = () => {
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const body = ["Nama,Email,Kata sandi sementara,Role", ...(res?.credentials ?? []).map((c) => [c.name, c.email, c.password, c.role].map(q).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }));
    a.download = "akun-sementara.csv"; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex flex-col gap-5">
      <section className={card}>
        <h2 className="text-lg font-extrabold">1. Siapkan file</h2>
        <p className="mt-1 max-w-3xl text-sm font-medium text-[var(--ink-2)]">
          Unduh template, bagikan ke para pengisi (tiap orang hanya mengisi sheet bagiannya), lalu kumpulkan di sini. Boleh mengunggah beberapa kali: data yang sudah ada otomatis dilewati.
        </p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <a className={`${btnGhost} inline-flex items-center`} href="/template-impor-gereja.xlsx" download>Unduh template kosong</a>
          <a className={`${btnGhost} inline-flex items-center`} href="/contoh-data-gereja.xlsx" download>Unduh contoh yang sudah terisi</a>
        </div>
      </section>

      <section className={card}>
        <h2 className="text-lg font-extrabold">2. Unggah dan periksa</h2>
        <p className="mt-1 text-sm font-medium text-[var(--ink-2)]">Pemeriksaan tidak mengubah data apa pun. Anda bisa melihat hasilnya dulu sebelum menyimpan.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); setFail(""); }}
            className="block w-full max-w-md rounded-xl border border-dashed border-[#B9BCE0] bg-[var(--surface-2)] p-2.5 text-sm font-semibold file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary-soft)] file:px-3 file:py-2 file:text-sm file:font-bold file:text-[var(--primary-ink)]" />
          <button type="button" className={btnPrimary} disabled={!file || !!busy} onClick={() => send("preview")}>{busy === "preview" ? "Memeriksa…" : "Periksa file"}</button>
        </div>
        {fail && <p role="alert" className="mt-3 rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-sm font-semibold text-[#a12b2b]">{fail}</p>}
      </section>

      {res?.fatal && <p role="alert" className="rounded-2xl bg-[#fdecec] px-4 py-3 text-sm font-semibold text-[#a12b2b]">{res.fatal}</p>}

      {res && !res.fatal && (
        <section className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold">{done ? "Hasil impor" : "3. Hasil pemeriksaan"}</h2>
              <p className="mt-1 text-sm font-semibold text-[var(--ink-2)]">
                {done ? `${totalNew} data tersimpan.` : `${totalNew} data siap diimpor.`} {totalErr > 0 ? `${totalErr} baris bermasalah dan akan dilewati.` : "Tidak ada baris bermasalah."}
              </p>
            </div>
          </div>

          {/* HP: satu baris per sheet; ketuk untuk melihat rincian masalah */}
          <div className="mt-3 overflow-hidden rounded-xl border border-[var(--line)] md:hidden">
            <CompactList label="Hasil per sheet">
              {found.map((s) => {
                const has = s.errors.length + s.notes.length > 0;
                return (
                  <CompactRow key={s.key} id={s.key} open={open.has(s.key)} onToggle={() => toggle(s.key)} expandable={has}
                    title={s.label}
                    sub={<>{s.total} baris · {done ? "tersimpan" : "siap"} <b className="text-[#1d7a46]">{s.created}</b> · dilewati {s.skipped}</>}
                    trailing={s.errors.length ? <span className="whitespace-nowrap rounded-full bg-[#fdecec] px-2.5 py-0.5 text-xs font-bold text-[#b3261e]">{s.errors.length} masalah</span> : <span className="text-xs font-semibold text-[var(--ink-2)]">OK</span>}>
                    <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto text-[13px]">
                      {s.errors.map((e, i) => <li key={`e${i}`} className="text-[#a12b2b]"><b>{e.row ? `Baris ${e.row}` : "Sheet"}:</b> {e.message}</li>)}
                      {s.notes.map((e, i) => <li key={`n${i}`} className="text-[var(--ink-2)]"><b>Baris {e.row}:</b> {e.message}</li>)}
                    </ul>
                  </CompactRow>
                );
              })}
            </CompactList>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--line)] max-md:hidden">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-[var(--surface-2)] text-xs font-bold uppercase tracking-wide text-[var(--ink-2)]">
                <tr><th className="px-3 py-2.5">Sheet</th><th className="px-3 py-2.5 text-right">Baris</th><th className="px-3 py-2.5 text-right">{done ? "Tersimpan" : "Siap"}</th><th className="px-3 py-2.5 text-right">Dilewati</th><th className="px-3 py-2.5 text-right">Bermasalah</th><th className="w-24 px-3 py-2.5" /></tr>
              </thead>
              <tbody>
                {found.map((s) => {
                  const has = s.errors.length + s.notes.length > 0;
                  const isOpen = open.has(s.key);
                  return (
                    <FragmentRows key={s.key} s={s} has={has} isOpen={isOpen} onToggle={() => toggle(s.key)} />
                  );
                })}
              </tbody>
            </table>
          </div>
          {res.source === "kuesioner" && (
            <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3">
              <p className="text-sm font-bold">File ini dikenali sebagai kuesioner pendataan dan sudah diubah otomatis ke format impor.</p>
              <p className="mt-1 text-xs font-medium text-[var(--ink-2)]">Nomor baris di bawah mengikuti nomor baris di tab kuesioner asalnya. Bila beberapa orang mengisi tab berbeda, unggah dulu file yang tab 1 (Orang)-nya terisi.</p>
              {(res.notes?.length ?? 0) > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-medium text-[var(--ink-2)]">
                  {res.notes!.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
            </div>
          )}
          {(res.retiredSheets?.length ?? 0) > 0 && <p className="mt-2 text-xs font-medium text-[var(--ink-2)]">Sheet {res.retiredSheets!.join(", ")} diabaikan: acara, penugasan, latihan, dan rapat sekarang dibuat lewat aplikasi, bukan lewat Excel.</p>}
          {res.unknownSheets.length > 0 && <p className="mt-2 text-xs font-medium text-[var(--ink-2)]">Sheet tidak dikenal (diabaikan): {res.unknownSheets.join(", ")}.</p>}

          {!done && (
            <div className="mt-4 flex flex-col gap-3 border-t border-[var(--line)] pt-4">
              {totalErr > 0 && (
                <label className="flex items-start gap-2.5 text-sm font-semibold">
                  <input type="checkbox" className="mt-0.5 size-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  Saya mengerti {totalErr} baris bermasalah tidak ikut disimpan. Baris lain tetap diimpor.
                </label>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={btnPrimary} disabled={!!busy || totalNew === 0 || (totalErr > 0 && !agree)} onClick={() => send("apply")}>
                  {busy === "apply" ? "Menyimpan… (bisa beberapa menit)" : `Impor ${totalNew} data`}
                </button>
                <span className="text-xs font-medium text-[var(--ink-2)]">Data master (orang, pelayanan, template) dan kelompok rapat disimpan sekaligus.</span>
              </div>
            </div>
          )}
        </section>
      )}

      {done && res && res.credentials.length > 0 && (
        <section className="rounded-[20px] border border-[#E7C27A] bg-[var(--gold-soft)] p-[22px]">
          <h2 className="text-lg font-extrabold">Kata sandi sementara ({res.credentials.length} akun)</h2>
          <p className="mt-1 max-w-3xl text-sm font-semibold text-[var(--gold-ink)]">
            Catat atau salin sekarang. Daftar ini hanya muncul sekali dan tidak bisa dilihat lagi setelah halaman ditutup. Tiap orang wajib mengganti kata sandinya saat login pertama.
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button type="button" className={btnGhost} onClick={copyAll}>Salin semua</button>
            <button type="button" className={btnGhost} onClick={csv}>Unduh CSV</button>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border border-[#E7C27A] bg-white md:hidden">
            <CompactList label="Kata sandi sementara">
              {res.credentials.map((c) => (
                <CompactRow key={c.email} id={c.email} open={credRows.open.has(c.email)} onToggle={credRows.toggle}
                  title={c.name} sub={c.email}
                  trailing={<span className="font-mono text-[13px] font-bold">{c.password}</span>}>
                  <Detail label="Email"><span className="break-all">{c.email}</span></Detail>
                  <Detail label="Kata sandi"><span className="font-mono font-bold">{c.password}</span></Detail>
                  <Detail label="Role">{c.role}</Detail>
                </CompactRow>
              ))}
            </CompactList>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-[#E7C27A] bg-white max-md:hidden">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs font-bold uppercase tracking-wide text-[var(--ink-2)]"><tr><th className="px-3 py-2.5">Nama</th><th className="px-3 py-2.5">Email</th><th className="px-3 py-2.5">Kata sandi</th><th className="px-3 py-2.5">Role</th></tr></thead>
              <tbody>
                {res.credentials.map((c) => (
                  <tr key={c.email} className="border-t border-[var(--line-2)]">
                    <td className="px-3 py-2 font-bold">{c.name}</td><td className="px-3 py-2">{c.email}</td><td className="px-3 py-2 font-mono font-bold">{c.password}</td><td className="px-3 py-2">{c.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function FragmentRows({ s, has, isOpen, onToggle }: { s: SheetResult; has: boolean; isOpen: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-t border-[var(--line-2)]">
        <td className="px-3 py-2.5 font-bold">{s.label}</td>
        <td className="px-3 py-2.5 text-right">{s.total}</td>
        <td className="px-3 py-2.5 text-right font-bold text-[#1d7a46]">{s.created}</td>
        <td className="px-3 py-2.5 text-right text-[var(--ink-2)]">{s.skipped}</td>
        <td className={`px-3 py-2.5 text-right font-bold ${s.errors.length ? "text-[#b3261e]" : "text-[var(--ink-2)]"}`}>{s.errors.length}</td>
        <td className="px-3 py-2.5 text-right">{has && <button type="button" onClick={onToggle} className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">{isOpen ? "Tutup" : "Rincian"}</button>}</td>
      </tr>
      {isOpen && (
        <tr className="bg-[var(--surface-2)]">
          <td colSpan={6} className="px-3 py-3">
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto text-[13px]">
              {s.errors.map((e, i) => <li key={`e${i}`} className="text-[#a12b2b]"><b>{e.row ? `Baris ${e.row}` : "Sheet"}:</b> {e.message}</li>)}
              {s.notes.map((e, i) => <li key={`n${i}`} className="text-[var(--ink-2)]"><b>Baris {e.row}:</b> {e.message}</li>)}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
