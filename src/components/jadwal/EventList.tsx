"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { FDateRange, FilterBar, FSearch, FSelect, listCard, Alert } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import { CompactList, CompactRow, Detail, useOpenRows } from "@/components/ui/CompactList";
import RoomOptions from "@/components/ui/RoomOptions";
import { useDebounced, usePagedList } from "@/components/ui/usePagedList";
import { dayShort, floorText, hm, monthRange, REHEARSAL_TONE, STATUS_LABEL, toneFor, ymd } from "@/lib/ui";

type Rehearsal = { id: string; seq: number; startsAt: string; endsAt: string; room: { id: string; name: string; floor: number | null }; note: string | null };
type Row = {
  id: string; number: string; title: string; status: string; startsAt: string; endsAt: string; templateId: string | null; templateName: string | null;
  room: { id: string; name: string; floor: number | null }; seatsTotal: number; seatsFilled: number; createdBy: string | null; rehearsals: Rehearsal[];
};
type Options = { templates: { id: string; name: string }[]; rooms: { id: string; name: string; floor: number | null }[] };

const dot = (t: string) => t.replace(":", ".");

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden className={`transition-transform ${open ? "rotate-90" : ""}`}>
      <path d="M4 2.5 8 6l-4 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function EventList() {
  const today = ymd(new Date());
  const def = monthRange(today);
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const [q, setQ] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [status, setStatus] = useState("");
  const [rehearsal, setRehearsal] = useState("");
  const [order, setOrder] = useState("asc");
  const search = useDebounced(q.trim());
  const rows = useOpenRows(); // HP: baris acara yang dibuka
  // Sesi latihan: default tersembunyi. allOpen membalik default; flipped = acara yang dikecualikan dari default.
  const [allOpen, setAllOpen] = useState(false);
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const isOpen = (id: string) => allOpen !== flipped.has(id);
  const toggleOne = (id: string) => setFlipped((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => { setAllOpen((v) => !v); setFlipped(new Set()); };

  const list = usePagedList<Row, { options: Options }>("/api/v1/events/list", { from, to, search, templateId, roomId, status, rehearsal, order });
  const opts = list.data?.options;
  const dirty = !!(q || templateId || roomId || status || rehearsal || order !== "asc" || from !== def.from || to !== def.to);
  const reset = () => { setQ(""); setTemplateId(""); setRoomId(""); setStatus(""); setRehearsal(""); setOrder("asc"); setFrom(def.from); setTo(def.to); };

  return (
    <div className="flex flex-col gap-4">
      <FilterBar active={dirty} onReset={reset} moreCount={(roomId ? 1 : 0) + (rehearsal ? 1 : 0) + (order !== "asc" ? 1 : 0)} mobileExtraCount={(from !== def.from ? 1 : 0) + (to !== def.to ? 1 : 0)}
        more={
          <>
            <FDateRange where="more" from={from} to={to} onFrom={setFrom} onTo={setTo} />
            <FSelect label="Ruangan" value={roomId} onChange={setRoomId} allLabel="Semua ruangan"><RoomOptions rooms={opts?.rooms ?? []} /></FSelect>
            <FSelect label="Sesi latihan" value={rehearsal} onChange={setRehearsal} allLabel="Semua" width="w-44"
              options={[{ value: "YES", label: "Sudah ada latihan" }, { value: "NO", label: "Belum ada latihan" }]} />
            <FSelect label="Urutan" value={order} onChange={(v) => setOrder(v || "asc")} allLabel="Terdekat dulu" width="w-40" options={[{ value: "desc", label: "Terjauh dulu" }]} />
          </>
        }>
        <FSearch value={q} onChange={setQ} placeholder="Judul atau nomor acara" />
        <FDateRange where="main" from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <FSelect label="Jenis ibadah" value={templateId} onChange={setTemplateId} allLabel="Semua ibadah" width="w-52">
          {opts?.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          <option value="NONE">Acara satu kali (tanpa template)</option>
        </FSelect>
        <FSelect label="Status" value={status} onChange={setStatus} allLabel="Semua status" width="w-40"
          options={[{ value: "DRAFT", label: "Draf" }, { value: "PUBLISHED", label: "Terbit" }, { value: "CANCELLED", label: "Dibatalkan" }]} />
      </FilterBar>
      {list.error && <Alert>{list.error}</Alert>}

      <div className={listCard} aria-busy={list.loading}>
        {(list.items ?? []).some((e) => e.rehearsals.length > 0) && (
          <div className="flex items-center justify-end border-b border-[var(--line-2)] px-4 py-2 max-md:hidden">
            <button type="button" onClick={toggleAll} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">
              <Chevron open={allOpen} />{allOpen ? "Sembunyikan semua latihan" : "Tampilkan semua latihan"}
            </button>
          </div>
        )}
        {/* HP: daftar ringkas, satu baris per acara */}
        {list.items === null && <p className="px-4 py-8 text-center text-sm text-[var(--ink-2)] md:hidden">Memuat…</p>}
        {list.items?.length === 0 && <p className="px-4 py-8 text-center text-sm font-semibold text-[var(--ink-2)] md:hidden">{dirty ? "Tidak ada acara yang cocok dengan filter ini." : "Belum ada acara."}</p>}
        {!!list.items?.length && (
          <CompactList label="Daftar acara">
            {list.items.map((e) => {
              const t = toneFor(e.title);
              const st = STATUS_LABEL[e.status] ?? STATUS_LABEL.DRAFT;
              return (
                <CompactRow key={e.id} id={e.id} open={rows.open.has(e.id)} onToggle={rows.toggle}
                  title={<span className="inline-flex items-center gap-2"><span className="size-2 flex-none rounded-full" style={{ background: t.dot }} />{e.title}</span>}
                  sub={`${dayShort(e.startsAt)} · ${dot(hm(e.startsAt))}–${dot(hm(e.endsAt))} · ${e.room.name}`}
                  trailing={<span className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: st.bg, color: st.fg }}>{st.text}</span>}>
                  <Detail label="Nomor">{e.number}</Detail>
                  <Detail label="Ruangan">{e.room.name}{e.room.floor !== null && ` · ${floorText(e.room.floor)}`}</Detail>
                  <Detail label="Kursi terisi">{e.seatsFilled}/{e.seatsTotal}</Detail>
                  {e.createdBy && <Detail label="Dibuat oleh">{e.createdBy}</Detail>}
                  {e.rehearsals.map((r) => (
                    <div key={r.id} className="rounded-lg px-2.5 py-1.5 text-xs" style={{ background: REHEARSAL_TONE.bg, color: REHEARSAL_TONE.fg }}>
                      <span className="font-extrabold">Latihan {r.seq}</span> · {dayShort(r.startsAt)} · {dot(hm(r.startsAt))}–{dot(hm(r.endsAt))} · {r.room.name}
                      {r.note && <span className="block font-medium">{r.note}</span>}
                    </div>
                  ))}
                  <Link href={`/jadwal/${e.id}`} className="h-9 self-start rounded-xl bg-[var(--primary)] px-4 text-[13px] font-bold leading-9 text-white">Buka acara</Link>
                </CompactRow>
              );
            })}
          </CompactList>
        )}
        <div className="overflow-x-auto max-md:hidden">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs font-bold uppercase tracking-[0.06em] text-[var(--ink-2)]">
              <tr><th className="px-4 py-3">Tanggal</th><th className="px-4 py-3">Acara</th><th className="px-4 py-3">Ruangan</th><th className="px-4 py-3">Kursi</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr>
            </thead>
            <tbody>
              {list.items === null && <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--ink-2)]">Memuat…</td></tr>}
              {list.items?.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center font-semibold text-[var(--ink-2)]">{dirty ? "Tidak ada acara yang cocok dengan filter ini." : "Belum ada acara."}</td></tr>}
              {list.items?.map((e) => {
                const t = toneFor(e.title);
                const st = STATUS_LABEL[e.status] ?? STATUS_LABEL.DRAFT;
                const open = isOpen(e.id);
                return (
                  <Fragment key={e.id}>
                  <tr className="border-t border-[var(--line-2)] hover:bg-[#FAFAFD]">
                    <td className="px-4 py-3 font-semibold">{dayShort(e.startsAt)}<span className="block text-xs text-[var(--ink-2)]">{hm(e.startsAt)}–{hm(e.endsAt)}</span></td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 font-bold"><span className="size-2 rounded-full" style={{ background: t.dot }} />{e.title}</span>
                      <span className="block text-xs text-[var(--ink-2)]">{e.number}{e.createdBy ? ` · dibuat oleh ${e.createdBy}` : ""}</span>
                      {e.rehearsals.length > 0 && (
                        <button type="button" onClick={() => toggleOne(e.id)} aria-expanded={open}
                          className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.05em] hover:brightness-95"
                          style={{ background: REHEARSAL_TONE.bg, color: REHEARSAL_TONE.fg }}>
                          <Chevron open={open} />{e.rehearsals.length} latihan
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold">{e.room.name}{e.room.floor !== null && <span className="block text-xs font-medium text-[var(--ink-2)]">{floorText(e.room.floor)}</span>}</td>
                    <td className="px-4 py-3 font-semibold">{e.seatsFilled}/{e.seatsTotal}</td>
                    <td className="px-4 py-3"><span className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: st.bg, color: st.fg }}>{st.text}</span></td>
                    <td className="px-4 py-3 text-right"><Link href={`/jadwal/${e.id}`} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Buka</Link></td>
                  </tr>
                  {open && e.rehearsals.map((r) => (
                    <tr key={`${e.id}-${r.id}`} className="bg-[#FAFAFD] text-[13px]">
                      <td className="py-2 pl-9 pr-4 font-semibold text-[var(--ink-2)]">{dayShort(r.startsAt)}<span className="block text-xs">{hm(r.startsAt)}–{hm(r.endsAt)}</span></td>
                      <td className="px-4 py-2">
                        <span className="inline-flex items-center gap-2 font-bold" style={{ color: REHEARSAL_TONE.fg }}>
                          <span className="whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.05em]" style={{ background: REHEARSAL_TONE.bg }}>Latihan {r.seq}</span>
                          <span className="font-semibold text-[var(--ink-2)]">{e.title}</span>
                        </span>
                        {r.note && <span className="block text-xs text-[var(--ink-2)]">{r.note}</span>}
                      </td>
                      <td className="px-4 py-2 font-semibold text-[var(--ink-2)]">{r.room.name}{r.room.floor !== null && <span className="block text-xs font-medium">{floorText(r.room.floor)}</span>}</td>
                      <td className="px-4 py-2" /><td className="px-4 py-2" />
                      <td className="px-4 py-2 text-right"><Link href={`/jadwal/${e.id}`} className="whitespace-nowrap rounded-lg px-3 py-1 text-xs font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Buka acara</Link></td>
                    </tr>
                  ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} noun="acara" />
      </div>
    </div>
  );
}
