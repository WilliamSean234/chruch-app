"use client";

import { useState } from "react";
import { Alert, FilterBar, FMonth, FSelect, listCard } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import { CompactList, CompactRow, Detail, useOpenRows } from "@/components/ui/CompactList";
import { showNotice } from "@/components/ui/NoticeHost";
import { showToast } from "@/components/ui/Toast";
import { usePagedList } from "@/components/ui/usePagedList";
import { btnGhost } from "@/components/jadwal/api";
import { teamsText, type LoadRow, type LoadSummary } from "@/lib/loadStats";
import { dayShort, monthRange, ymd } from "@/lib/ui";

type Options = { teams: { id: string; name: string }[]; years: number[] };
type Extra = { summary: LoadSummary; scoped: boolean; truncated: boolean; options: Options };

const LEVEL = {
  TINGGI: { text: "Beban tinggi", bg: "#FBEFD6", fg: "#6F4304" },
  BELUM: { text: "Belum bertugas", bg: "#ECEEF4", fg: "#3A3F58" },
} as const;

const dec = (n: number) => String(n).replace(".", ",");

function Chip({ level }: { level: LoadRow["level"] }) {
  if (level === "WAJAR") return null;
  const l = LEVEL[level];
  return <span className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: l.bg, color: l.fg }}>{l.text}</span>;
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "warn" }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-[var(--line)] bg-white px-4 py-3" style={tone === "warn" ? { background: "#FBEFD6", borderColor: "#E7C27A" } : undefined}>
      <span className="text-xs font-bold text-[var(--ink-2)]" style={tone === "warn" ? { color: "#6F4304" } : undefined}>{label}</span>
      <span className="text-2xl font-extrabold leading-none" style={tone === "warn" ? { color: "#6F4304" } : undefined}>{value}</span>
    </div>
  );
}

function Bar({ value, max, hot }: { value: number; max: number; hot: boolean }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <span className="flex items-center gap-2.5">
      <span className="h-2 min-w-24 flex-1 overflow-hidden rounded-full bg-[var(--bg)]" aria-hidden="true">
        <span className={`block h-full rounded-full ${hot ? "bg-[var(--gold)]" : "bg-[var(--primary)]"}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="min-w-6 text-right text-sm font-extrabold">{value}</span>
    </span>
  );
}

/** Statistik beban pelayan: berapa ibadah tiap orang bertugas di satu bulan (atau rentang), dengan rincian per tim. */
export default function LoadStats() {
  const def = monthRange(ymd(new Date()));
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const [team, setTeam] = useState("");
  const [sort, setSort] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = useOpenRows();

  const list = usePagedList<LoadRow, Extra>("/api/v1/reports/load", { from, to, team, sort });
  const sum = list.data?.summary;
  const opts = list.data?.options;
  const max = sum?.max ?? 0;
  const dirty = !!(team || sort || from !== def.from || to !== def.to);
  const reset = () => { setTeam(""); setSort(""); setFrom(def.from); setTo(def.to); };

  async function download() {
    setBusy(true);
    try {
      const q = new URLSearchParams({ from, to, format: "xlsx" });
      if (team) q.set("team", team);
      if (sort) q.set("sort", sort);
      const r = await fetch(`/api/v1/reports/load?${q}`, { cache: "no-store" });
      if (!r.ok) {
        let msg = "Berkas belum bisa dibuat. Coba lagi sebentar lagi.";
        try { msg = (await r.json())?.error?.message ?? msg; } catch { /* bukan JSON */ }
        showNotice(msg, "Gagal mengunduh");
        return;
      }
      const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "BEBAN_PELAYAN.xlsx";
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      showToast("Berkas diunduh.");
    } catch {
      showNotice("Koneksi terputus saat membuat berkas. Coba lagi.", "Gagal mengunduh");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FilterBar active={dirty} onReset={reset}>
        <FMonth from={from} years={opts?.years} onRange={(f, t) => { setFrom(f); setTo(t); }} />
        <FSelect label="Tim" value={team} onChange={setTeam} allLabel={list.data?.scoped ? "Semua tim saya" : "Semua tim"}
          options={(opts?.teams ?? []).map((t) => ({ value: t.id, label: t.name }))} />
        <FSelect label="Urutan" value={sort} onChange={setSort} allLabel="Paling sering bertugas"
          options={[{ value: "sedikit", label: "Paling jarang bertugas" }, { value: "nama", label: "Nama A–Z" }]} />
      </FilterBar>
      {list.error && <Alert>{list.error}</Alert>}

      {sum && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Pelayan bertugas" value={sum.serving} />
          <Stat label="Ibadah di periode" value={sum.events} />
          <Stat label="Rata-rata ibadah" value={dec(sum.average)} />
          <Stat label="Beban tinggi" value={sum.heavy} tone={sum.heavy > 0 ? "warn" : undefined} />
          <Stat label="Belum bertugas" value={sum.idle} />
        </div>
      )}

      <div className={listCard} aria-busy={list.loading}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line-2)] px-4 py-3">
          <span className="text-[13px] font-bold text-[var(--ink-2)]">{list.total ? `${list.total} orang` : "Daftar pelayan"}</span>
          <button type="button" onClick={download} disabled={busy || !list.total} className={`${btnGhost} !h-9 !px-3.5 text-[13px]`}>{busy ? "Menyiapkan…" : "Unduh Excel"}</button>
        </div>

        {list.items === null && <p className="px-4 py-8 text-center text-sm text-[var(--ink-2)]">Memuat…</p>}
        {list.items?.length === 0 && (
          <p className="px-4 py-8 text-center text-sm font-semibold text-[var(--ink-2)]">Tidak ada data untuk periode dan tim ini.</p>
        )}

        {/* HP: satu baris per orang, rincian dibuka dengan ketuk */}
        {!!list.items?.length && (
          <CompactList label="Beban pelayan">
            {list.items.map((r) => (
              <CompactRow key={r.personId} id={r.personId} open={rows.open.has(r.personId)} onToggle={rows.toggle}
                title={r.name}
                sub={`${r.events} ibadah${r.main ? ` · ${r.main}` : ""}`}
                trailing={<Chip level={r.level} />}>
                <Bar value={r.events} max={max} hot={r.level === "TINGGI"} />
                <Detail label="Posisi utama">{r.main || "—"}</Detail>
                <Detail label="Kursi dipegang">{r.seats}</Detail>
                <Detail label="Per tim">{r.teams.length ? teamsText(r.teams) : "—"}</Detail>
                <Detail label={r.events > 0 ? "Terakhir bertugas" : "Terakhir sebelumnya"}>{r.last ? dayShort(r.last) : "—"}</Detail>
              </CompactRow>
            ))}
          </CompactList>
        )}

        {!!list.items?.length && (
          <div className="max-md:hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--surface-2)] text-xs font-bold uppercase tracking-[0.06em] text-[var(--ink-2)]">
                <tr><th className="px-4 py-3">Nama</th><th className="px-4 py-3">Posisi utama</th><th className="w-64 px-4 py-3">Ibadah</th><th className="px-4 py-3">Per tim</th><th className="px-4 py-3 text-right">Terakhir</th></tr>
              </thead>
              <tbody>
                {list.items.map((r) => (
                  <tr key={r.personId} className="border-t border-[var(--line-2)] align-middle hover:bg-[#FAFAFD]">
                    <td className="px-4 py-3">
                      <span className="block font-bold">{r.name}</span>
                      {r.level !== "WAJAR" && <span className="mt-1 inline-block"><Chip level={r.level} /></span>}
                    </td>
                    <td className="px-4 py-3 text-[var(--ink-2)]">{r.main || "—"}</td>
                    <td className="px-4 py-3"><Bar value={r.events} max={max} hot={r.level === "TINGGI"} /></td>
                    <td className="px-4 py-3 text-[13px] font-semibold text-[var(--ink-2)]">{r.teams.length ? teamsText(r.teams) : "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-[13px] font-semibold text-[var(--ink-2)]">{r.last ? dayShort(r.last) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} noun="orang" />
      </div>

      <div className="flex flex-col gap-1.5 text-xs font-semibold leading-relaxed text-[var(--ink-2)]">
        <p className="m-0">Yang dihitung hanya ibadah yang sudah terbit dan tidak dibatalkan; rapat tidak ikut. Ini angka jadwal, bukan kehadiran sebenarnya.</p>
        <p className="m-0">Dua posisi di ibadah yang sama dihitung satu ibadah. Jumlah rincian per tim bisa lebih besar dari angka Ibadah bila satu ibadah melibatkan orang yang sama di dua tim.</p>
        <p className="m-0">Beban tinggi: sedikitnya 3 ibadah dan sedikitnya 1,5 kali rata-rata. Belum bertugas: tercatat bisa melayani di tim ini tetapi tidak dijadwalkan di periode ini; kolom Terakhir memakai jadwal sebelum periode.</p>
        {list.data?.scoped && <p className="m-0">Anda melihat tugas di tim Anda saja.</p>}
        {list.data?.truncated && <p className="m-0 text-[#6F4304]">Datanya terlalu banyak sehingga dipotong. Persempit periodenya.</p>}
      </div>
    </div>
  );
}
