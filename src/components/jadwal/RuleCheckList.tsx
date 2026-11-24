"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, FilterBar, FSelect, listCard } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import { CompactList, CompactRow, Detail, useOpenRows } from "@/components/ui/CompactList";
import { usePagedList } from "@/components/ui/usePagedList";
import { dayShort, hm, STATUS_LABEL, toneFor } from "@/lib/ui";

type Violation = { code: string; label: string; severity: "ATURAN" | "PERINGATAN"; message: string };
type Row = { id: string; number: string; title: string; status: string; startsAt: string; endsAt: string; room: string; violations: Violation[] };
type Rule = { code: string; label: string; severity: "ATURAN" | "PERINGATAN"; hint: string; events: number };

const dot = (t: string) => t.replace(":", ".");
const SEV = {
  ATURAN: { text: "Melanggar", bg: "#FBE4E4", fg: "#9B1C1C" },
  PERINGATAN: { text: "Periksa", bg: "#FBEFD6", fg: "#6F4304" },
} as const;

/** Banyak pelanggaran per acara: yang melanggar aturan didahulukan daripada yang sekadar perlu diperiksa. */
const worst = (r: Row) => (r.violations.some((v) => v.severity === "ATURAN") ? "ATURAN" : "PERINGATAN");

function Issues({ list }: { list: Violation[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {list.map((v, i) => (
        <li key={`${v.code}-${i}`} className="flex flex-col gap-1 rounded-xl bg-[var(--bg)] px-3 py-2.5">
          <span className="self-start whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11px] font-extrabold" style={{ background: SEV[v.severity].bg, color: SEV[v.severity].fg }}>{v.label}</span>
          <span className="text-[13px] font-semibold leading-snug text-[var(--ink)]">{v.message}</span>
        </li>
      ))}
    </ul>
  );
}

export default function RuleCheckList() {
  const [rule, setRule] = useState("");
  const [past, setPast] = useState("");
  const rows = useOpenRows();
  const list = usePagedList<Row, { options: { rules: Rule[] }; truncated: boolean }>("/api/v1/events/violations", { rule, past });
  const rules = list.data?.options.rules ?? [];
  const dirty = !!(rule || past);
  const total = rules.reduce((n, r) => n + r.events, 0);

  return (
    <div className="flex flex-col gap-4">
      <FilterBar active={dirty} onReset={() => { setRule(""); setPast(""); }}>
        <FSelect label="Jenis aturan" value={rule} onChange={setRule} allLabel="Semua aturan" width="w-72"
          options={rules.map((r) => ({ value: r.code, label: `${r.label}${r.events ? ` (${r.events})` : ""}` }))} />
        <FSelect label="Waktu" value={past} onChange={setPast} allLabel="Yang akan datang" options={[{ value: "1", label: "Termasuk yang sudah lewat" }]} />
      </FilterBar>
      {list.error && <Alert>{list.error}</Alert>}
      {rule && <p className="-mt-1 text-xs font-semibold text-[var(--ink-2)]">{rules.find((r) => r.code === rule)?.hint}</p>}
      {list.data?.truncated && <p className="text-xs font-semibold text-[#6F4304]">Yang diperiksa dibatasi 600 acara terdekat. Persempit dengan memilih hanya yang akan datang.</p>}

      <div className={listCard} aria-busy={list.loading}>
        {list.items === null && <p className="px-4 py-8 text-center text-sm text-[var(--ink-2)]">Memuat…</p>}
        {list.items?.length === 0 && (
          <p className="px-4 py-8 text-center text-sm font-semibold text-[var(--ink-2)]">
            {dirty ? "Tidak ada acara yang cocok dengan filter ini." : total === 0 ? "Semua acara sudah sesuai aturan." : "Tidak ada acara."}
          </p>
        )}

        {/* HP: satu baris per acara, isi masalahnya dibuka dengan ketuk */}
        {!!list.items?.length && (
          <CompactList label="Acara yang menyimpang dari aturan">
            {list.items.map((e) => {
              const t = toneFor(e.title);
              const st = STATUS_LABEL[e.status] ?? STATUS_LABEL.DRAFT;
              const sev = SEV[worst(e)];
              return (
                <CompactRow key={e.id} id={e.id} open={rows.open.has(e.id)} onToggle={rows.toggle}
                  title={<span className="inline-flex items-center gap-2"><span className="size-2 flex-none rounded-full" style={{ background: t.dot }} />{e.title}</span>}
                  sub={`${dayShort(e.startsAt)} · ${dot(hm(e.startsAt))} · ${e.violations.length} masalah`}
                  trailing={<span className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: sev.bg, color: sev.fg }}>{sev.text}</span>}>
                  <Detail label="Status"><span className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: st.bg, color: st.fg }}>{st.text}</span></Detail>
                  <Issues list={e.violations} />
                  <Link href={`/jadwal/${e.id}`} className="h-9 self-start rounded-xl bg-[var(--primary)] px-4 text-[13px] font-bold leading-9 text-white">Buka acara</Link>
                </CompactRow>
              );
            })}
          </CompactList>
        )}

        {!!list.items?.length && (
          <div className="max-md:hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--surface-2)] text-xs font-bold uppercase tracking-[0.06em] text-[var(--ink-2)]">
                <tr><th className="px-4 py-3">Acara</th><th className="px-4 py-3">Masalah</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody>
                {list.items.map((e) => {
                  const t = toneFor(e.title);
                  const st = STATUS_LABEL[e.status] ?? STATUS_LABEL.DRAFT;
                  return (
                    <tr key={e.id} className="border-t border-[var(--line-2)] align-top hover:bg-[#FAFAFD]">
                      <td className="w-64 px-4 py-3">
                        <span className="inline-flex items-center gap-2 font-bold"><span className="size-2 rounded-full" style={{ background: t.dot }} />{e.title}</span>
                        <span className="block text-xs font-semibold text-[var(--ink-2)]">{dayShort(e.startsAt)} · {hm(e.startsAt)}–{hm(e.endsAt)}</span>
                        <span className="mt-1 inline-block whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: st.bg, color: st.fg }}>{st.text}</span>
                      </td>
                      <td className="px-4 py-3"><Issues list={e.violations} /></td>
                      <td className="px-4 py-3 text-right"><Link href={`/jadwal/${e.id}`} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Buka</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} noun="acara" />
      </div>
    </div>
  );
}
