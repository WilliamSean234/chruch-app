"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Fab from "@/components/ui/Fab";
import SavedDialog from "@/components/ui/SavedDialog";
import { showToast } from "@/components/ui/Toast";
import { btnGhost, btnPrimary, card, errMsg, inputCls } from "@/components/jadwal/api";
import { normName } from "@/lib/teamFormats";
import { buildPdf, renderPngs, toText } from "@/lib/scheduleExport";
import type { ExportModel, PersonOpt, ExistingService } from "@/lib/teamSchedule";

const FORMAT = "ebm";
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

type Col = { key: string; label: string; ministry: string; ministryId: string | null };
type Row = { date: string; month: number; line: number; names: Record<string, string>; existing: { 1?: ExistingService; 2?: ExistingService } };
type NameRow = { key: string; raw: string; count: number; columns: string[]; status: "MATCHED" | "AMBIGUOUS" | "NONE"; personId: string | null; guess: string | null; suggestions: string[] };
type Extra = { key: string; label: string; suggested: string; exists: boolean; ministryId: string | null };
type Preview = {
  extras: Extra[]; year: number; sheetName: string | null; errors: { line?: number; message: string }[]; warnings: { line?: number; message: string }[];
  columns: Col[]; newMinistries: string[]; services: { n: number; name: string; startTime: string }[]; rows: Row[]; names: NameRow[]; people: PersonOpt[];
};
type SvcResult = { n: 1 | 2; name: string; state: string; reason?: string; changed: number; rejected: { column: string; message: string }[] };
type DateResult = { date: string; services: SvcResult[] };

const thisYear = new Date().getFullYear();
const dayText = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${SHORT[m! - 1]}`; };
const disp = (p: PersonOpt | undefined) => (p ? p.nickname?.trim() || p.name : "");

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export default function TeamSchedulePanel() {
  const [tab, setTab] = useState<"upload" | "export">("upload");
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" className="flex gap-2">
        {([["upload", "Unggah jadwal"], ["export", "Bagikan jadwal"]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
            className={`h-11 flex-1 rounded-xl px-5 text-sm font-bold md:flex-none ${tab === k ? "bg-[var(--primary)] text-white" : "border border-[var(--line)] bg-white text-[var(--primary-ink)] hover:bg-[var(--bg)]"}`}>{l}</button>
        ))}
      </div>
      {tab === "upload" ? <UploadTab goExport={() => setTab("export")} /> : <ExportTab />}
    </div>
  );
}

// ───────────────────────── Unggah ─────────────────────────

function UploadTab({ goExport }: { goExport: () => void }) {
  const [year, setYear] = useState(thisYear + (new Date().getMonth() >= 9 ? 1 : 0));
  const [file, setFile] = useState<File | null>(null);
  const [withCurrent, setWithCurrent] = useState(false); // template berisi jadwal yang sudah ada
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState("");
  const [pv, setPv] = useState<Preview | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({}); // kunci nama → id orang | "skip" | ""
  const [extraOn, setExtraOn] = useState<Record<string, { on: boolean; name: string }>>({}); // pelayanan baru dari kolom file
  const [dropped, setDropped] = useState<Set<string>>(new Set()); // `${tanggal}|${kolom}` yang tidak jadi diisi karena merangkap
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<DateResult[] | null>(null);
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const cols = useMemo<Col[]>(() => {
    if (!pv) return [];
    const extra = pv.extras.filter((x) => extraOn[x.key]?.on).map((x) => {
      const name = (extraOn[x.key]!.name || x.suggested).trim();
      return { key: x.key, label: name.toUpperCase(), ministry: name, ministryId: name.toLowerCase() === x.suggested.toLowerCase() ? x.ministryId : null };
    });
    return [...pv.columns, ...extra];
  }, [pv, extraOn]);
  const extraErr = useMemo(() => {
    if (!pv) return "";
    const taken = new Set(pv.columns.map((c) => c.ministry.toLowerCase()));
    for (const x of pv.extras) {
      const e = extraOn[x.key];
      if (!e?.on) continue;
      const n = e.name.trim().toLowerCase();
      if (!n) return "Nama pelayanan baru tidak boleh kosong.";
      if (taken.has(n)) return `"${e.name.trim()}" sudah ada di format. Pakai nama lain atau matikan kolomnya.`;
      taken.add(n);
    }
    return "";
  }, [pv, extraOn]);

  const people = useMemo(() => new Map((pv?.people ?? []).map((p) => [p.id, p])), [pv]);

  async function check() {
    if (!file) return;
    setBusy(true); setFail(""); setPv(null); setResults(null); setDropped(new Set());
    try {
      const fd = new FormData();
      fd.append("file", file); fd.append("year", String(year));
      const r = await fetch(`/api/v1/team-schedule/${FORMAT}/preview`, { method: "POST", body: fd, cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) setFail(errMsg(d));
      else {
        const p = d as Preview;
        setPv(p);
        setExtraOn(Object.fromEntries(p.extras.map((x) => [x.key, { on: true, name: x.suggested }])));
        setChoice(Object.fromEntries(p.names.map((n) => [n.key, n.status === "MATCHED" && n.personId ? n.personId : ""])));
      }
    } catch { setFail("Koneksi terputus. Coba lagi."); }
    setBusy(false);
  }

  // isi akhir tiap tanggal: kolom → id orang | null
  const cellsOf = (row: Row): Record<string, string | null> => {
    const out: Record<string, string | null> = {};
    for (const c of cols) {
      const raw = row.names[c.key];
      const pid = raw ? choice[normName(raw)] : "";
      out[c.key] = pid && pid !== "skip" && !dropped.has(`${row.date}|${c.key}`) ? pid : null;
    }
    return out;
  };
  const rawCells = (row: Row) => {
    const out: Record<string, string | null> = {};
    for (const c of cols) { const raw = row.names[c.key]; const pid = raw ? choice[normName(raw)] : ""; out[c.key] = pid && pid !== "skip" ? pid : null; }
    return out;
  };

  const stateOf = (row: Row, n: 1 | 2, cells: Record<string, string | null>): "baru" | "ubah" | "sama" | "lewat" | "batal" => {
    const ex = row.existing[n];
    if (!ex) return "baru";
    if (ex.past) return "lewat";
    if (ex.status === "CANCELLED") return "batal";
    const ids = new Set(cols.map((c) => c.ministryId).filter(Boolean));
    const foreign = ex.seats.some((s) => !ids.has(s.ministryId) || s.slotNo > 1);
    const diff = cols.some((c) => (ex.seats.find((s) => s.ministryId === c.ministryId && s.slotNo === 1)?.personId ?? null) !== (cells[c.key] ?? null));
    return foreign || diff ? "ubah" : "sama";
  };

  const view = useMemo(() => {
    if (!pv) return null;
    const rows = pv.rows.map((r) => {
      const cells = cellsOf(r);
      return { r, cells, s1: stateOf(r, 1, cells), s2: stateOf(r, 2, cells) };
    });
    // rangkap: satu orang di dua kolom atau lebih pada tanggal yang sama (sesudah pilihan nama)
    const doubles: { date: string; person: string; cols: Col[] }[] = [];
    for (const r of pv.rows) {
      const raw = rawCells(r);
      const by = new Map<string, Col[]>();
      for (const c of cols) { const p = raw[c.key]; if (p) by.set(p, [...(by.get(p) ?? []), c]); }
      for (const [p, cols] of by) if (cols.length > 1) doubles.push({ date: r.date, person: p, cols });
    }
    const count = (s: string) => rows.filter((x) => x.s1 === s || x.s2 === s).length;
    const todo = rows.filter((x) => x.s1 === "baru" || x.s1 === "ubah" || x.s2 === "baru" || x.s2 === "ubah");
    const used = new Set(pv.rows.flatMap((r) => cols.map((c) => r.names[c.key]).filter(Boolean).map((x) => normName(x!))));
    const unresolved = pv.names.filter((n) => used.has(n.key) && !choice[n.key]).length;
    return { rows, doubles, todo, unresolved, used, baru: count("baru"), ubah: count("ubah"), sama: rows.filter((x) => x.s1 === "sama" && x.s2 === "sama").length, lewat: rows.filter((x) => x.s1 === "lewat" || x.s2 === "lewat").length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pv, choice, dropped, cols]);

  const canSave = !!pv && !!view && pv.rows.length > 0 && view.unresolved === 0 && !extraErr && view.todo.length > 0 && !progress;

  async function save() {
    if (!pv || !view || !canSave) return;
    setResults(null); setSaved(false);
    const out: DateResult[] = [];
    setProgress({ done: 0, total: view.todo.length });
    for (const [i, x] of view.todo.entries()) {
      try {
        const r = await fetch(`/api/v1/team-schedule/${FORMAT}/apply`, {
          method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
          body: JSON.stringify({ year: pv.year, date: x.r.date, cells: x.cells, extras: cols.filter((c) => c.key.startsWith("x_")).map((c) => ({ key: c.key, ministry: c.ministry })) }),
        });
        const d = await r.json().catch(() => null);
        if (r.ok) out.push(d as DateResult);
        else out.push({ date: x.r.date, services: [{ n: 1, name: "", state: "dilewati", reason: errMsg(d), changed: 0, rejected: [] }] });
      } catch {
        out.push({ date: x.r.date, services: [{ n: 1, name: "", state: "dilewati", reason: "Koneksi terputus.", changed: 0, rejected: [] }] });
      }
      setProgress({ done: i + 1, total: view.todo.length });
    }
    // ejaan yang dipilih manual disimpan, supaya unggahan berikutnya cocok sendiri
    const items = pv.names.filter((n) => view.used.has(n.key) && n.status !== "MATCHED" && choice[n.key] && choice[n.key] !== "skip").map((n) => ({ personId: choice[n.key]!, raw: n.raw }));
    if (items.length) await fetch(`/api/v1/team-schedule/${FORMAT}/aliases`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) }).catch(() => null);
    setProgress(null); setResults(out); setSaved(true);
  }

  const summary = useMemo(() => {
    if (!results) return null;
    const all = results.flatMap((r) => r.services.map((s) => ({ ...s, date: r.date })));
    return {
      dibuat: all.filter((s) => s.state === "dibuat").length,
      diubah: all.filter((s) => s.state === "diubah").length,
      dilewati: all.filter((s) => s.state === "dilewati"),
      rejected: all.flatMap((s) => s.rejected.map((x) => ({ date: s.date, name: s.name, ...x }))),
    };
  }, [results]);

  const options = (n: NameRow) => {
    const all = pv!.people;
    const sug = n.suggestions.map((id) => people.get(id)).filter((p): p is PersonOpt => !!p);
    const rest = all.filter((p) => !n.suggestions.includes(p.id));
    return (
      <select value={choice[n.key] ?? ""} onChange={(e) => setChoice((c) => ({ ...c, [n.key]: e.target.value }))} className={`${inputCls} ${!choice[n.key] ? "border-[#E0A100] bg-[#FFF8E6]" : ""}`} aria-label={`Orang untuk "${n.raw}"`}>
        <option value="">— pilih orangnya —</option>
        <option value="skip">Lewati (kursi dikosongkan)</option>
        {sug.length > 0 && <optgroup label="Mirip">{sug.map((p) => <option key={p.id} value={p.id}>{p.name}{p.nickname ? ` (${p.nickname})` : ""}</option>)}</optgroup>}
        <optgroup label="Semua orang">{rest.map((p) => <option key={p.id} value={p.id}>{p.name}{p.nickname ? ` (${p.nickname})` : ""}{p.isMember ? "" : " · bukan tim EBM"}</option>)}</optgroup>
      </select>
    );
  };

  const stateChip = (s: string) => {
    const tone: Record<string, string> = { baru: "bg-[#E3F3E7] text-[#1B6B34]", ubah: "bg-[#FFF2CC] text-[#7A5200]", sama: "bg-[#EEF0F8] text-[#565B76]", lewat: "bg-[#EEF0F8] text-[#8A8FA8]", batal: "bg-[#FDECEC] text-[#A12B2B]" };
    return <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${tone[s]}`}>{s}</span>;
  };

  return (
    <>
      <section className={card}>
        <h2 className="text-lg font-extrabold">1. Pilih tahun dan file</h2>
        <p className="mt-1 max-w-3xl text-sm font-medium text-[var(--ink-2)]">
          Satu baris tanggal berlaku untuk Ibadah Minggu I dan II. Unggahan membuat acara yang belum ada (berstatus draf) dan mengganti petugas tim EBM di acara yang sudah ada. Bagian acara selain tim EBM tidak disentuh.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-bold text-[var(--ink-2)]">Tahun
            <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setPv(null); }} className={`${inputCls} w-28`}>
              {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <a className={`${btnGhost} inline-flex items-center`} href={`/api/v1/team-schedule/${FORMAT}/template?year=${year}${withCurrent ? "&filled=1" : ""}`}>Unduh template {year}</a>
          <label className="flex min-h-11 max-w-md cursor-pointer items-start gap-2.5 rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm font-semibold">
            <input type="checkbox" className="mt-0.5 size-4 flex-none" checked={withCurrent} onChange={(e) => setWithCurrent(e.target.checked)} />
            <span>Isi dengan orang yang sudah dijadwalkan di {year}<span className="block text-[12.5px] font-medium text-[var(--ink-2)]">{withCurrent ? "Template berisi petugas tim EBM yang sudah tercatat. Cocok untuk merevisi jadwal." : "Template kosong, hanya tanggal Minggu."}</span></span>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input ref={input} type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPv(null); setResults(null); setFail(""); }}
            className="block w-full max-w-md rounded-xl border border-dashed border-[#B9BCE0] bg-[var(--surface-2)] p-2.5 text-sm font-semibold file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary-soft)] file:px-3 file:py-2 file:text-sm file:font-bold file:text-[var(--primary-ink)]" />
          <button type="button" className={btnPrimary} disabled={!file || busy} onClick={check}>{busy ? "Memeriksa…" : "Periksa file"}</button>
        </div>
        {fail && <p role="alert" className="mt-3 rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-sm font-semibold text-[#a12b2b]">{fail}</p>}
      </section>

      {pv && view && (
        <>
          {pv.errors.length > 0 && (
            <section className="rounded-2xl border border-[#F0C4C4] bg-[#FDECEC] p-4">
              <h3 className="text-sm font-extrabold text-[#A12B2B]">Perlu diperbaiki ({pv.errors.length})</h3>
              <ul className="mt-1.5 list-disc pl-5 text-sm font-semibold text-[#A12B2B]">{pv.errors.slice(0, 20).map((e, i) => <li key={i}>{e.message}</li>)}</ul>
              {pv.rows.length > 0 && <p className="mt-2 text-[13px] font-semibold text-[#7A2B2B]">Baris yang bermasalah dilewati. Tanggal lain tetap bisa disimpan.</p>}
            </section>
          )}
          {pv.warnings.length > 0 && (
            <section className="rounded-2xl border border-[#EBD9A8] bg-[#FFF8E6] p-4">
              <h3 className="text-sm font-extrabold text-[#7A5200]">Catatan ({pv.warnings.length})</h3>
              <ul className="mt-1.5 list-disc pl-5 text-sm font-semibold text-[#7A5200]">{pv.warnings.slice(0, 20).map((e, i) => <li key={i}>{e.message}</li>)}</ul>
            </section>
          )}

          {pv.rows.length > 0 && (
            <>
              {pv.extras.length > 0 && (
                <section className="rounded-2xl border border-[#EBD9A8] bg-[#FFF8E6] p-4">
                  <h2 className="text-base font-extrabold text-[#7A5200]">Pelayanan yang belum terdaftar ({pv.extras.length})</h2>
                  <p className="mt-1 text-sm font-semibold text-[#7A5200]">Kolom berikut ada di file tetapi belum menjadi pelayanan tim EBM. Daftarkan sebagai pelayanan baru? Bila tidak, kolomnya dilewati.</p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {pv.extras.map((x) => {
                      const e = extraOn[x.key] ?? { on: true, name: x.suggested };
                      return (
                        <li key={x.key} className="grid items-center gap-2 rounded-xl border border-[#EBD9A8] bg-white p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                          <label className="flex items-center gap-2 text-sm font-extrabold">
                            <input type="checkbox" className="size-4" checked={e.on} onChange={(ev) => setExtraOn((m) => ({ ...m, [x.key]: { ...e, on: ev.target.checked } }))} />
                            <span className="min-w-0 truncate">Daftarkan kolom "{x.label}"</span>
                          </label>
                          <div className="flex flex-col gap-1">
                            <input value={e.name} disabled={!e.on} maxLength={60} onChange={(ev) => setExtraOn((m) => ({ ...m, [x.key]: { ...e, name: ev.target.value } }))} className={`${inputCls} disabled:opacity-50`} aria-label={`Nama pelayanan baru untuk ${x.label}`} />
                            {x.exists && e.on && e.name.trim().toLowerCase() === x.suggested.toLowerCase() && <span className="text-[12px] font-semibold text-[#565B76]">Sudah ada pelayanan dengan nama ini, jadi dipakai.</span>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {extraErr && <p role="alert" className="mt-2 text-[13px] font-bold text-[#A12B2B]">{extraErr}</p>}
                </section>
              )}

              <section className={card}>
                <h2 className="text-lg font-extrabold">2. Cocokkan nama</h2>
                <p className="mt-1 text-sm font-medium text-[var(--ink-2)]">
                  {view.unresolved > 0 ? `${view.unresolved} nama belum dipilih. Pilih orangnya atau lewati.` : "Semua nama sudah cocok."} Pilihan Anda diingat untuk unggahan berikutnya.
                  {pv.newMinistries.length > 0 && <> Posisi baru yang akan dibuat: <b>{pv.newMinistries.join(", ")}</b>.</>}
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {[...pv.names].filter((n) => view.used.has(n.key)).sort((a, b) => Number(!!choice[a.key]) - Number(!!choice[b.key])).map((n) => (
                    <li key={n.key} className="grid items-center gap-2 rounded-xl border border-[var(--line)] p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-extrabold">{n.raw}</div>
                        <div className="text-[12.5px] font-semibold text-[var(--ink-2)]">{n.count}× · {n.columns.join(", ")}</div>
                      </div>
                      {options(n)}
                    </li>
                  ))}
                </ul>
              </section>

              {view.doubles.length > 0 && (
                <section className={card}>
                  <h2 className="text-lg font-extrabold">Merangkap ({view.doubles.length})</h2>
                  <p className="mt-1 text-sm font-medium text-[var(--ink-2)]">Satu orang di dua posisi pada hari yang sama. Dibolehkan untuk sesama posisi EBM. Hilangkan centang bila salah satunya tidak jadi.</p>
                  <ul className="mt-3 flex flex-col gap-2">
                    {view.doubles.map((d) => (
                      <li key={`${d.date}|${d.person}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[var(--line)] px-3 py-2.5 text-sm">
                        <span className="font-extrabold">{dayText(d.date)} · {disp(people.get(d.person))}</span>
                        {d.cols.map((c) => {
                          const k = `${d.date}|${c.key}`;
                          return (
                            <label key={c.key} className="flex items-center gap-1.5 font-semibold">
                              <input type="checkbox" checked={!dropped.has(k)} onChange={(e) => setDropped((s) => { const n = new Set(s); if (e.target.checked) n.delete(k); else n.add(k); return n; })} className="size-4" />
                              {c.label}
                            </label>
                          );
                        })}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className={card}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-extrabold">3. Pratinjau per tanggal</h2>
                    <p className="mt-1 text-sm font-semibold text-[var(--ink-2)]">
                      {view.baru} acara baru · {view.ubah} akan diubah · {view.sama} sama · {view.lewat} sudah lewat. Hanya tanggal yang baru atau berubah yang disimpan.
                    </p>
                  </div>
                  <button type="button" className={`${btnPrimary} max-md:hidden`} disabled={!canSave} onClick={save}>
                    {progress ? `Menyimpan ${progress.done}/${progress.total}…` : `Simpan jadwal (${view.todo.length} tanggal)`}
                  </button>
                </div>
                {progress && <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#E4E6F2]"><div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} /></div>}
                {view.unresolved > 0 && <p className="mt-2 text-[13px] font-bold text-[#7A5200]">Pilih semua nama di langkah 2 dulu sebelum menyimpan.</p>}
                {extraErr && <p className="mt-2 text-[13px] font-bold text-[#A12B2B]">{extraErr}</p>}
                <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--line)]">
                  <table className="w-full min-w-[760px] border-collapse text-[13px]">
                    <thead>
                      <tr className="bg-[#F3E9CF] text-left">
                        <th className="sticky left-0 bg-[#F3E9CF] px-2.5 py-2 font-extrabold">Tanggal</th>
                        <th className="px-2.5 py-2 font-extrabold">Status</th>
                        {cols.map((c) => <th key={c.key} className="px-2.5 py-2 font-extrabold">{c.label}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {view.rows.map(({ r, cells, s1, s2 }, i) => {
                        const ex = r.existing[1] ?? r.existing[2];
                        return (
                          <tr key={r.date} className={i % 2 ? "bg-[#F6F7FC]" : ""}>
                            <td className="sticky left-0 whitespace-nowrap bg-inherit px-2.5 py-2 font-extrabold">{dayText(r.date)}</td>
                            <td className="whitespace-nowrap px-2.5 py-2">{s1 === s2 ? stateChip(s1) : <>{stateChip(s1)} {stateChip(s2)}</>}</td>
                            {cols.map((c) => {
                              const now = cells[c.key] ? disp(people.get(cells[c.key]!)) : "";
                              const old = ex?.seats.find((s) => s.ministryId === c.ministryId && s.slotNo === 1);
                              const oldName = old?.personId && old.personId !== cells[c.key] ? old.personName : null;
                              return (
                                <td key={c.key} className="px-2.5 py-2 align-top">
                                  <div className="font-semibold">{now || <span className="text-[#A0A4BC]">—</span>}</div>
                                  {oldName && ex && !ex.past && <div className="text-[11.5px] font-semibold text-[#8A6119]">dulu: {oldName}</div>}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          <Fab actions={[{ key: "save", label: progress ? "Menyimpan…" : "Simpan jadwal", icon: "save", disabled: !canSave, busy: !!progress, onClick: save }]} />
        </>
      )}

      {summary && (
        <section className={card}>
          <h2 className="text-lg font-extrabold">Hasil penyimpanan</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--ink-2)]">{summary.dibuat} acara dibuat (draf), {summary.diubah} acara diperbarui.</p>
          {summary.rejected.length > 0 && (
            <div className="mt-3 rounded-xl border border-[#F0C4C4] bg-[#FDECEC] p-3.5">
              <h3 className="text-sm font-extrabold text-[#A12B2B]">Kursi yang ditolak ({summary.rejected.length}). Atur manual di acaranya.</h3>
              <ul className="mt-1.5 list-disc pl-5 text-[13px] font-semibold text-[#A12B2B]">{summary.rejected.slice(0, 30).map((x, i) => <li key={i}>{dayText(x.date)} · {x.name} · {x.column}: {x.message}</li>)}</ul>
            </div>
          )}
          {summary.dilewati.length > 0 && (
            <div className="mt-3 rounded-xl border border-[#EBD9A8] bg-[#FFF8E6] p-3.5">
              <h3 className="text-sm font-extrabold text-[#7A5200]">Dilewati ({summary.dilewati.length})</h3>
              <ul className="mt-1.5 list-disc pl-5 text-[13px] font-semibold text-[#7A5200]">{summary.dilewati.slice(0, 30).map((x, i) => <li key={i}>{dayText(x.date)}{x.name ? ` · ${x.name}` : ""}: {x.reason}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      {saved && summary && (
        <SavedDialog title="Jadwal tim tersimpan"
          message={`${summary.dibuat} acara dibuat sebagai draf, ${summary.diubah} diperbarui.${summary.rejected.length ? ` ${summary.rejected.length} kursi ditolak, lihat daftarnya di halaman.` : ""}`}
          onClose={() => setSaved(false)}
          actions={[
            { label: "Tutup", onClick: () => setSaved(false) },
            { label: "Bagikan jadwal", onClick: () => { setSaved(false); goExport(); } },
            { label: "Lihat jadwal acara", primary: true, onClick: () => { window.location.href = "/jadwal"; } },
          ]} />
      )}
    </>
  );
}

// ───────────────────────── Bagikan ─────────────────────────

function ExportTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [months, setMonths] = useState<Set<number>>(new Set([now.getMonth() + 1]));
  const [model, setModel] = useState<ExportModel | null>(null);
  const [busy, setBusy] = useState("");
  const [fail, setFail] = useState("");
  const [canShareFiles, setCanShareFiles] = useState(false);

  const monthsParam = [...months].sort((a, b) => a - b).join(",");
  const toggle = (m: number) => { setModel(null); setMonths((s) => { const n = new Set(s); if (n.has(m)) n.delete(m); else n.add(m); return n; }); };

  async function load() {
    if (!months.size) return;
    setBusy("load"); setFail("");
    try {
      const r = await fetch(`/api/v1/team-schedule/${FORMAT}/export?year=${year}&months=${monthsParam}`, { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) setFail(errMsg(d)); else setModel(d as ExportModel);
    } catch { setFail("Koneksi terputus. Coba lagi."); }
    setBusy("");
  }

  const stem = () => `jadwal-${FORMAT}-${year}-${months.size === 12 ? "setahun" : monthsParam.replace(/,/g, "-")}`;

  async function images(mode: "share" | "download") {
    if (!model) return;
    setBusy("img"); setFail("");
    try {
      const pngs = await renderPngs(model);
      const files = pngs.map((p) => new File([p.blob], p.name, { type: "image/png" }));
      if (mode === "share" && navigator.canShare?.({ files })) {
        try { await navigator.share({ files, title: `${model.title} ${model.year}` }); }
        catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setFail("Tidak bisa membuka menu bagikan. Pakai Unduh gambar."); }
      } else {
        for (const f of files) { download(f, f.name); await new Promise((r) => setTimeout(r, 350)); }
      }
    } catch (e) { setFail(e instanceof Error ? e.message : "Gagal membuat gambar."); }
    setBusy("");
  }
  const pdf = () => { if (model) download(buildPdf(model), `${stem()}.pdf`); };
  const copyText = async () => {
    if (!model) return;
    try { await navigator.clipboard.writeText(toText(model)); showToast("Teks tersalin. Tempel di WhatsApp."); }
    catch { showToast("Browser ini tidak bisa menyalin. Coba lagi atau pakai gambar.", "error"); }
  };
  const detect = () => setCanShareFiles(typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [new File(["x"], "x.png", { type: "image/png" })] }));

  return (
    <>
      <section className={card}>
        <h2 className="text-lg font-extrabold">1. Pilih periode</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-bold text-[var(--ink-2)]">Tahun
            <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setModel(null); }} className={`${inputCls} w-28`}>
              {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <button type="button" className={btnGhost} onClick={() => { setModel(null); setMonths(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])); }}>Setahun penuh</button>
          <button type="button" className={btnGhost} onClick={() => { setModel(null); setMonths(new Set([now.getMonth() + 1])); }}>Bulan ini</button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {MONTHS.map((m, i) => (
            <button key={m} type="button" aria-pressed={months.has(i + 1)} onClick={() => toggle(i + 1)}
              className={`h-11 rounded-xl border text-sm font-bold ${months.has(i + 1) ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-ink)]" : "border-[var(--line)] bg-white text-[var(--ink-2)] hover:bg-[var(--bg)]"}`}>{m}</button>
          ))}
        </div>
        <div className="mt-3">
          <button type="button" className={btnPrimary} disabled={!months.size || busy === "load"} onClick={() => { void load().then(detect); }}>{busy === "load" ? "Memuat…" : "Tampilkan jadwal"}</button>
        </div>
        {fail && <p role="alert" className="mt-3 rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-sm font-semibold text-[#a12b2b]">{fail}</p>}
      </section>

      {model && (
        <section className={card}>
          <h2 className="text-lg font-extrabold">2. Bagikan</h2>
          <p className="mt-1 text-sm font-medium text-[var(--ink-2)]">Sumbernya adalah jadwal acara saat ini, jadi perubahan manual ikut tampil. Nama memakai nama panggilan bila ada.</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {canShareFiles && <button type="button" className={btnPrimary} disabled={busy === "img"} onClick={() => images("share")}>{busy === "img" ? "Membuat gambar…" : "Bagikan gambar"}</button>}
            <button type="button" className={canShareFiles ? btnGhost : btnPrimary} disabled={busy === "img"} onClick={() => images("download")}>{busy === "img" && !canShareFiles ? "Membuat gambar…" : model.months.length > 1 ? `Unduh ${model.months.length} gambar` : "Unduh gambar"}</button>
            <button type="button" className={btnGhost} onClick={pdf}>Unduh PDF</button>
            <button type="button" className={btnGhost} onClick={copyText}>Salin teks WhatsApp</button>
            <a className={`${btnGhost} inline-flex items-center`} href={`/api/v1/team-schedule/${FORMAT}/export?year=${year}&months=${monthsParam}&as=xlsx`}>Unduh Excel</a>
          </div>
          {model.hasDiff && <p className="mt-3 text-[13px] font-semibold text-[#7A5200]">Ada tanggal yang petugas Ibadah I dan II-nya berbeda; ditulis "I / II" dan diberi warna.</p>}
          <div className="mt-4 flex flex-col gap-4">
            {model.months.map((mo) => (
              <div key={mo.month} className="overflow-x-auto rounded-xl border border-[var(--line)]">
                <div className="bg-[var(--primary)] px-3 py-2 text-center text-sm font-extrabold text-white">{mo.name} {model.year}</div>
                <table className="w-full min-w-[720px] border-collapse text-[13px]">
                  <thead><tr className="bg-[#F3E9CF]"><th className="px-2.5 py-2 text-left font-extrabold">TGL</th>{model.columns.map((c) => <th key={c.key} className="px-2.5 py-2 text-left font-extrabold">{c.label}</th>)}</tr></thead>
                  <tbody>
                    {mo.rows.map((r, i) => (
                      <tr key={r.date} className={i % 2 ? "bg-[#F6F7FC]" : ""}>
                        <td className="px-2.5 py-2 font-extrabold">{r.day}</td>
                        {model.columns.map((c) => <td key={c.key} className={`px-2.5 py-2 font-semibold ${r.cells[c.key]?.includes(" / ") ? "bg-[#FFF4D6]" : ""}`}>{r.cells[c.key] || <span className="text-[#A0A4BC]">—</span>}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[13px] font-semibold text-[var(--ink-2)]">Perlu mengoreksi satu hari saja? Ubah di <Link className="font-bold text-[var(--primary-ink)] underline" href="/jadwal">Jadwal acara</Link>, lalu tampilkan ulang di sini.</p>
        </section>
      )}
    </>
  );
}
