"use client";

import { useMemo, useState } from "react";
import { Alert, FMonth, FilterBar, FSearch, FSelect, listCard } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import { useDebounced, usePagedList } from "@/components/ui/usePagedList";
import { monthRange, ymd } from "@/lib/ui";

type Row = { id: string; at: string; user: string; role: string | null; action: string; label: string; target: string | null; how: string | null; reason: string | null };
type Options = { categories: { key: string; label: string }[]; users: { id: string; name: string }[]; years: number[]; events: { value: string; label: string; group: string; parts?: { value: string; label: string; solo: boolean }[] }[] };

const stamp = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const TONE: Record<string, { bg: string; fg: string }> = {
  event: { bg: "#E6F0FA", fg: "#1D4F8C" }, meeting: { bg: "#F8E6DD", fg: "#7A3A1E" }, group: { bg: "#F8E6DD", fg: "#7A3A1E" }, person: { bg: "#E3F3E7", fg: "#1B6B34" },
  user: { bg: "#EEF0FD", fg: "#3037A8" }, registration: { bg: "#EEF0FD", fg: "#3037A8" }, booking: { bg: "#FBE4E4", fg: "#9B1C1C" }, attendance: { bg: "#FBF0D9", fg: "#6F4304" }, import: { bg: "#ECEEF4", fg: "#565B76" },
};
// jenis aksi yang belum punya warna sendiri ikut warna kelompoknya
const TONE_ALIAS: Record<string, string> = { rehearsal: "event", template: "event", assignment: "event", ministry: "person", team: "person", cg: "person", positions: "person", communities: "person", "cg-groups": "person", rooms: "booking" };
const toneOf = (action: string) => { const k = action.split(".")[0]; return TONE[k] ?? TONE[TONE_ALIAS[k] ?? ""] ?? TONE.import; };

/** Log aktivitas: tab di Pengaturan (Superadmin) dan halaman /log (Pengawas). */
export default function AuditPanel() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [userId, setUserId] = useState("");
  const [eventId, setEventId] = useState("");
  const [group, setGroup] = useState(""); // kategori acara (nama yang sama): hanya mempersempit daftar Acara di bawahnya
  const [part, setPart] = useState(""); // satu ibadah dari pilihan gabungan Ibadah Minggu I dan II; kosong = keduanya
  const def = monthRange(ymd(new Date()));
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const search = useDebounced(q.trim());
  const list = usePagedList<Row, { options: Options }>("/api/v1/audit-logs", { search, category, userId, eventId: part || eventId, from, to });
  const opts = list.data?.options;
  const parts = opts?.events.find((x) => x.value === eventId)?.parts;
  // kategori = nama acara tanpa tanggal, urut dari yang paling baru muncul; satu kategori memuat semua tanggalnya
  const groups = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of opts?.events ?? []) n.set(e.group, (n.get(e.group) ?? 0) + 1);
    return [...n].map(([g, c]) => ({ value: g, label: `${g} (${c})` }));
  }, [opts?.events]);
  // dalam satu kategori nama acaranya tidak diulang di tiap baris, cukup tanggalnya
  const shownEvents = group ? opts?.events.filter((e) => e.group === group).map((e) => ({ ...e, label: e.label.startsWith(`${group} · `) ? e.label.slice(group.length + 3) : e.label })) : opts?.events;
  const dateExtra = (from !== def.from ? 1 : 0) + (to !== def.to ? 1 : 0);
  const dirty = !!(q || category || userId || eventId || group || dateExtra);
  const reset = () => { setQ(""); setCategory(""); setUserId(""); setEventId(""); setPart(""); setGroup(""); setFrom(def.from); setTo(def.to); };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[13.5px] font-medium leading-relaxed text-[var(--ink-2)]">
        Kapan, siapa, apa, dan bagaimana. Isi rapat (judul, nama peserta, tautan, notulen) sengaja tidak ditampilkan di sini.
      </p>
      <FilterBar active={dirty} onReset={reset} moreCount={userId ? 1 : 0}
        more={<>
          <FSelect label="Pengguna" value={userId} onChange={setUserId} allLabel="Semua pengguna" options={opts?.users.map((x) => ({ value: x.id, label: x.name }))} />
        </>}>
        <FSearch value={q} onChange={setQ} placeholder="Jenis aktivitas atau alasan" />
        <FMonth from={from} years={opts?.years} onRange={(f, t) => { setFrom(f); setTo(t); setEventId(""); setPart(""); setGroup(""); }} />
        <FSelect label="Jenis" value={category} onChange={setCategory} allLabel="Semua jenis" options={opts?.categories.map((c) => ({ value: c.key, label: c.label }))} />
        <FSelect label="Nama acara" value={group} onChange={(v) => { setGroup(v); setEventId(""); setPart(""); }} allLabel="Semua nama" options={groups} width="w-56" />
        <FSelect label={group ? "Tanggal" : "Acara"} value={eventId} onChange={(v) => { setEventId(v); setPart(""); }} allLabel={group ? "Pilih tanggal" : "Semua acara"} options={shownEvents} width="w-64" />
      </FilterBar>

      {parts && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ibadah">
          <span className="text-xs font-extrabold text-[var(--ink-2)]">Tampilkan</span>
          {[{ value: "", label: "Kedua ibadah", solo: false }, ...parts].map((x) => (
            <button key={x.value || "semua"} type="button" onClick={() => setPart(x.value)} aria-pressed={part === x.value}
              className={`h-8 rounded-full border px-3.5 text-[12.5px] font-bold ${part === x.value ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-ink)]" : "border-[var(--line)] bg-white text-[var(--ink-2)] hover:bg-[var(--bg)]"}`}>
              {x.label}{x.solo ? " · diubah sendiri" : ""}
            </button>
          ))}
        </div>
      )}

      {list.error && <Alert>{list.error}</Alert>}

      <section className={listCard} aria-busy={list.loading}>
        {list.items === null && <p className="px-6 py-10 text-center text-sm font-semibold text-[var(--ink-2)]">Memuat…</p>}
        {list.items?.length === 0 && !list.error && <p className="px-6 py-10 text-center text-sm font-semibold text-[var(--ink-2)]">{dirty ? "Tidak ada aktivitas yang cocok dengan filter ini." : "Tidak ada aktivitas pada bulan ini."}</p>}
        {list.items?.map((r) => {
          const t = toneOf(r.action);
          return (
            <div key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-1.5 border-b border-[var(--line-2)] px-5 py-3.5 last:border-b-0">
              <span className="w-[150px] flex-none pt-0.5 text-[12.5px] font-semibold text-[var(--ink-2)] max-md:w-full">{stamp(r.at)}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1 max-md:basis-full">
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="inline-block max-w-full truncate rounded-full px-2.5 py-[3px] text-xs font-extrabold" style={{ background: t.bg, color: t.fg }}>{r.label}</span>
                  {r.target && <span className="min-w-0 break-words text-sm font-bold">{r.target}</span>}
                </span>
                {r.how && <span className="break-words text-[13px] font-medium text-[var(--ink)]">{r.how}</span>}
                {r.reason && <span className="text-[13px] font-semibold text-[#6f4304]">Alasan: {r.reason}</span>}
                <span className="text-[12.5px] font-medium text-[var(--ink-2)]">Oleh <b className="font-bold text-[var(--ink)]">{r.user}</b>{r.role ? ` · ${r.role}` : ""}</span>
              </div>
            </div>
          );
        })}
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} noun="aktivitas" />
      </section>
    </div>
  );
}
