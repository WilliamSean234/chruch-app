"use client";

import { useState } from "react";
import { Alert, FMonth, FilterBar, FSearch, FSelect, listCard } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import { useDebounced, usePagedList } from "@/components/ui/usePagedList";
import { monthRange, ymd } from "@/lib/ui";

type Row = { id: string; at: string; user: string; action: string; label: string; entity: string; reason: string | null; detail: string | null };
type Options = { categories: { key: string; label: string }[]; users: { id: string; name: string }[] };

const stamp = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const TONE: Record<string, { bg: string; fg: string }> = {
  event: { bg: "#E6F0FA", fg: "#1D4F8C" }, meeting: { bg: "#F8E6DD", fg: "#7A3A1E" }, group: { bg: "#F8E6DD", fg: "#7A3A1E" }, person: { bg: "#E3F3E7", fg: "#1B6B34" },
  user: { bg: "#EEF0FD", fg: "#3037A8" }, registration: { bg: "#EEF0FD", fg: "#3037A8" }, booking: { bg: "#FBE4E4", fg: "#9B1C1C" }, attendance: { bg: "#FBF0D9", fg: "#6F4304" }, import: { bg: "#ECEEF4", fg: "#565B76" },
};
const toneOf = (action: string) => TONE[action.split(".")[0]] ?? TONE.import;

/** Log aktivitas: tab di Pengaturan (Superadmin) dan halaman /log (Pengawas). */
export default function AuditPanel() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [userId, setUserId] = useState("");
  const def = monthRange(ymd(new Date()));
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const search = useDebounced(q.trim());
  const list = usePagedList<Row, { options: Options }>("/api/v1/audit-logs", { search, category, userId, from, to });
  const opts = list.data?.options;
  const dateExtra = (from !== def.from ? 1 : 0) + (to !== def.to ? 1 : 0);
  const dirty = !!(q || category || userId || dateExtra);
  const reset = () => { setQ(""); setCategory(""); setUserId(""); setFrom(def.from); setTo(def.to); };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[13.5px] font-medium leading-relaxed text-[var(--ink-2)]">
        Catatan siapa mengubah apa dan kapan. Isi rapat (nama peserta, judul tautan, notulen) sengaja tidak ditampilkan di sini.
      </p>
      <FilterBar active={dirty} onReset={reset} moreCount={userId ? 1 : 0}
        more={<>
          <FSelect label="Pengguna" value={userId} onChange={setUserId} allLabel="Semua pengguna" options={opts?.users.map((x) => ({ value: x.id, label: x.name }))} />
        </>}>
        <FSearch value={q} onChange={setQ} placeholder="Jenis aktivitas atau alasan" />
        <FMonth from={from} onRange={(f, t) => { setFrom(f); setTo(t); }} />
        <FSelect label="Jenis" value={category} onChange={setCategory} allLabel="Semua jenis" options={opts?.categories.map((c) => ({ value: c.key, label: c.label }))} />
      </FilterBar>

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
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="inline-block max-w-full truncate rounded-full px-2.5 py-[3px] text-xs font-extrabold" style={{ background: t.bg, color: t.fg }}>{r.label}</span>
                  <span className="text-sm font-bold">{r.user}</span>
                </span>
                {r.reason && <span className="text-[13px] font-semibold text-[#6f4304]">Alasan: {r.reason}</span>}
                {r.detail && <span className="break-words text-[12.5px] font-medium text-[var(--ink-2)]">{r.detail}</span>}
              </div>
            </div>
          );
        })}
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} noun="aktivitas" />
      </section>
    </div>
  );
}
