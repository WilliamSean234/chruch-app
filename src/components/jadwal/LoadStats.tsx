"use client";

import { useState } from "react";
import { Alert, FilterBar, FMonth, FSearch, FSelect, listCard } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import { useOpenRows } from "@/components/ui/CompactList";
import { showNotice } from "@/components/ui/NoticeHost";
import { showToast } from "@/components/ui/Toast";
import { useDebounced, usePagedList } from "@/components/ui/usePagedList";
import { btnGhost } from "@/components/jadwal/api";
import { teamsText, type LoadRow, type LoadSummary } from "@/lib/loadStats";
import { dayShort, hm, monthRange, toneFor, WEEKDAYS, ymd } from "@/lib/ui";

type Options = { teams: { id: string; name: string }[]; years: number[] };
type Extra = { summary: LoadSummary; scoped: boolean; truncated: boolean; options: Options };

const dec = (n: number) => String(n).replace(".", ",");

/** Hari (MIN..SAB), angka tanggal, dan tanggal ISO dalam zona gereja; sama dengan rekap di bawah kalender. */
function dateBits(iso: string) {
  const key = ymd(iso);
  const [y, m, d] = key.split("-").map(Number);
  const wd = new Date(Date.UTC(y!, m! - 1, d)).getUTCDay();
  return { iso: key, day: d!, weekday: WEEKDAYS[wd]!, sunday: wd === 0 };
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "warn" }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-[var(--line)] bg-white px-4 py-3" style={tone === "warn" ? { background: "#FBEFD6", borderColor: "#E7C27A" } : undefined}>
      <span className="text-xs font-bold text-[var(--ink-2)]" style={tone === "warn" ? { color: "#6F4304" } : undefined}>{label}</span>
      <span className="text-2xl font-extrabold leading-none" style={tone === "warn" ? { color: "#6F4304" } : undefined}>{value}</span>
    </div>
  );
}

/** Badge jumlah di kanan baris: biru = wajar, kuning = beban tinggi, abu-abu = belum bertugas. Lebar tetap di HP supaya sejajar. */
function Count({ r }: { r: LoadRow }) {
  const base = "whitespace-nowrap rounded-full px-2.5 py-0.5 text-center text-xs font-extrabold max-md:w-[100px] max-md:px-1.5 max-md:text-[11.5px]";
  if (r.level === "BELUM") return <span className={`${base} bg-[#ECEEF4] text-[#3A3F58]`}>Belum bertugas</span>;
  if (r.level === "TINGGI") return <span className={`${base} bg-[#FBEFD6] text-[#6F4304]`}>{r.events} ibadah</span>;
  return <span className={`${base} bg-[var(--primary-soft)] text-[var(--primary-ink)]`}>{r.events} ibadah</span>;
}

/** Statistik beban pelayan: berapa ibadah tiap orang bertugas di satu bulan (atau rentang), dengan rincian tanggal dan per tim. */
export default function LoadStats() {
  const def = monthRange(ymd(new Date()));
  const today = ymd(new Date());
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const [team, setTeam] = useState("");
  const [sort, setSort] = useState("");
  const [q, setQ] = useState("");
  const search = useDebounced(q.trim());
  const [busy, setBusy] = useState(false);
  const rows = useOpenRows();

  const list = usePagedList<LoadRow, Extra>("/api/v1/reports/load", { from, to, team, sort, search });
  const sum = list.data?.summary;
  const opts = list.data?.options;
  const dirty = !!(q || team || sort || from !== def.from || to !== def.to);
  const reset = () => { setQ(""); setTeam(""); setSort(""); setFrom(def.from); setTo(def.to); };

  async function download() {
    setBusy(true);
    try {
      const p = new URLSearchParams({ from, to, format: "xlsx" });
      if (team) p.set("team", team);
      if (sort) p.set("sort", sort);
      const r = await fetch(`/api/v1/reports/load?${p}`, { cache: "no-store" });
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
        <FSearch value={q} onChange={setQ} placeholder="Nama pelayan" />
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
          <button type="button" onClick={download} disabled={busy || !sum} className={`${btnGhost} !h-9 !px-3.5 text-[13px]`}>{busy ? "Menyiapkan…" : "Unduh Excel"}</button>
        </div>

        <div className="flex flex-col gap-2 px-4 py-3">
          <p className="m-0 text-xs font-semibold text-[var(--ink-2)]">Klik nama untuk melihat tanggal, ibadah, dan posisinya. Lencana kuning = beban tinggi, abu-abu = belum bertugas.</p>

          {list.items === null && <p className="py-6 text-center text-sm text-[var(--ink-2)]">Memuat…</p>}
          {list.items?.length === 0 && (
            <p className="py-6 text-center text-sm font-semibold text-[var(--ink-2)]">{search ? "Tidak ada nama yang cocok." : "Tidak ada data untuk periode dan tim ini."}</p>
          )}

          {!!list.items?.length && (
            <ul className="flex flex-col" aria-label="Beban pelayan">
              {list.items.map((r) => {
                const on = rows.open.has(r.personId);
                const panel = `beban-${r.personId}`;
                return (
                  <li key={r.personId} className="border-b border-[var(--line-2)] last:border-b-0">
                    <button type="button" onClick={() => rows.toggle(r.personId)} aria-expanded={on} aria-controls={panel}
                      className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left hover:bg-[var(--bg)]">
                      <span className="grid size-7 flex-none place-items-center text-sm font-bold text-[var(--ink-2)]" aria-hidden="true">
                        <span className={`transition-transform ${on ? "rotate-90" : ""}`}>›</span>
                      </span>
                      <span className="min-w-0 truncate px-1 py-1 text-sm font-bold max-md:flex-1">{r.name}</span>
                      <span className="flex min-h-8 min-w-0 flex-1 items-center justify-end gap-1.5 max-md:flex-none">
                        {r.can.length > 0 && (
                          <span className="hidden min-w-0 items-center justify-end gap-1 overflow-hidden sm:flex" title={`Bisa: ${r.can.join(", ")}`}>
                            {r.can.slice(0, 3).map((c) => (
                              <span key={c} className="truncate rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-2)]">{c}</span>
                            ))}
                            {r.can.length > 3 && <span className="flex-none whitespace-nowrap rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--ink-2)]">+{r.can.length - 3}</span>}
                          </span>
                        )}
                        <Count r={r} />
                      </span>
                    </button>

                    {on && (
                      <div id={panel} className="mb-2 ml-9 flex flex-col gap-1.5">
                        {r.teams.length > 0 && (
                          <p className="m-0 text-xs font-semibold text-[var(--ink-2)]">
                            Per tim: {teamsText(r.teams)}{r.seats !== r.events ? ` · ${r.seats} kursi` : ""}
                          </p>
                        )}
                        {r.can.length > 0 && <p className="m-0 text-xs font-semibold text-[var(--ink-2)]">Bisa: {r.can.join(", ")}</p>}
                        {r.services.length === 0 && (
                          <p className="m-0 text-xs font-semibold text-[var(--ink-2)]">
                            Belum bertugas di periode ini. {r.last ? `Terakhir bertugas sebelumnya: ${dayShort(r.last)}.` : "Belum ada jadwal sebelumnya yang tercatat."}
                          </p>
                        )}
                        {r.services.length > 0 && (
                          <ul className="flex flex-col gap-1">
                            {r.services.map((s, i) => {
                              const t = toneFor(s.title);
                              const d = dateBits(s.at);
                              return (
                                <li key={`${s.eventId}-${i}`} className="flex items-center gap-2.5" style={{ opacity: d.iso < today ? 0.62 : 1 }}>
                                  <span className="flex w-[46px] flex-none items-baseline justify-end gap-1">
                                    <span className={`text-[10.5px] font-bold tracking-[0.06em] ${d.sunday ? "text-[var(--gold-ink)]" : "text-[var(--ink-2)]"}`}>{d.weekday}</span>
                                    <span className={`text-[13px] font-extrabold ${d.iso === today ? "text-[var(--primary)]" : "text-[var(--ink)]"}`}>{d.day}</span>
                                  </span>
                                  <span className="flex min-h-[28px] min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-[11.5px] font-bold leading-tight"
                                    style={{ background: t.bg, color: t.fg }} title={`${s.title} · ${s.seat} · ${s.team}`}>
                                    <span className="size-[7px] flex-none rounded-full" style={{ background: t.dot }} aria-hidden="true" />
                                    <span className="min-w-0 truncate">{hm(s.at)} {t.short}</span>
                                    <span className="ml-auto flex-none font-semibold opacity-80">{s.seat}</span>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} noun="orang" />
      </div>

      <div className="flex flex-col gap-1.5 text-xs font-semibold leading-relaxed text-[var(--ink-2)]">
        <p className="m-0">Yang dihitung hanya ibadah yang sudah terbit dan tidak dibatalkan; rapat dan latihan tidak ikut. Ini angka jadwal, bukan kehadiran sebenarnya.</p>
        <p className="m-0">Dua posisi di ibadah yang sama dihitung satu ibadah. Jumlah per tim bisa lebih besar dari angka ibadah bila satu ibadah melibatkan orang yang sama di dua tim.</p>
        <p className="m-0">Beban tinggi: sedikitnya 3 ibadah dan sedikitnya 1,5 kali rata-rata. Belum bertugas: tercatat bisa melayani di tim ini tetapi tidak dijadwalkan di periode ini.</p>
        {list.data?.scoped && <p className="m-0">Anda melihat tugas di tim Anda saja.</p>}
        {list.data?.truncated && <p className="m-0 text-[#6F4304]">Datanya terlalu banyak sehingga dipotong. Persempit periodenya.</p>}
      </div>
    </div>
  );
}
