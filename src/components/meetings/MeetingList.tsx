"use client";

import Link from "next/link";
import { useState } from "react";
import { FDateRange, FilterBar, FSearch, FSelect, listCard, Alert } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import RoomOptions from "@/components/ui/RoomOptions";
import { useDebounced, usePagedList } from "@/components/ui/usePagedList";
import { floorText, hm, MONTHS, monthRange, WEEKDAYS, ymd } from "@/lib/ui";

type Item = {
  id: string; number: string; status: string; startsAt: string; endsAt: string; room: { id: string; name: string; floor: number | null }; group: { id: string; name: string };
  displayTitle: string; isMember: boolean;
};
type Options = { groups: { id: string; name: string }[]; rooms: { id: string; name: string; floor: number | null }[] };
const RAPAT = { bg: "#F8E6DD", fg: "#7A3A1E", dot: "#C0562D" };

export default function MeetingList() {
  const [when, setWhen] = useState<"next" | "past" | "all">("next");
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [status, setStatus] = useState("");
  const [mine, setMine] = useState("");
  const def = monthRange(ymd(new Date()));
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const search = useDebounced(q.trim());

  const list = usePagedList<Item, { options: Options }>("/api/v1/meetings/list", { when, search, groupId, roomId, status, mine, from, to });
  const opts = list.data?.options;
  const dateChanged = from !== def.from || to !== def.to;
  const dirty = !!(q || groupId || roomId || status || mine || dateChanged);
  const reset = () => { setQ(""); setGroupId(""); setRoomId(""); setStatus(""); setMine(""); setFrom(def.from); setTo(def.to); };
  const seg = (on: boolean) => `h-[38px] rounded-[9px] px-4 text-[13.5px] font-bold ${on ? "bg-white text-[var(--primary-ink)] shadow-sm" : "text-[var(--ink-2)]"}`;
  const empty = dirty ? "Tidak ada rapat yang cocok dengan filter ini." : when === "next" ? "Tidak ada rapat yang akan datang pada rentang tanggal ini." : when === "past" ? "Tidak ada rapat yang sudah lewat pada rentang tanggal ini." : "Tidak ada rapat pada rentang tanggal ini.";

  return (
    <div className="flex flex-col gap-4">
      <FilterBar active={dirty} onReset={reset} moreCount={[roomId, status].filter(Boolean).length} mobileExtraCount={(from !== def.from ? 1 : 0) + (to !== def.to ? 1 : 0)}
        lead={
          <div className="flex gap-0.5 self-start rounded-xl bg-[#e7e9f3] p-1" role="group" aria-label="Waktu rapat">
          <button type="button" onClick={() => setWhen("next")} className={seg(when === "next")}>Akan datang</button>
          <button type="button" onClick={() => setWhen("past")} className={seg(when === "past")}>Sudah lewat</button>
          <button type="button" onClick={() => setWhen("all")} className={seg(when === "all")}>Semua</button>
      </div>
        }
        more={
          <>
            <FDateRange where="more" from={from} to={to} onFrom={setFrom} onTo={setTo} />
            <FSelect label="Ruangan" value={roomId} onChange={setRoomId} allLabel="Semua ruangan"><RoomOptions rooms={opts?.rooms ?? []} /></FSelect>
            <FSelect label="Status" value={status} onChange={setStatus} allLabel="Semua status" options={[{ value: "PUBLISHED", label: "Berlaku" }, { value: "CANCELLED", label: "Dibatalkan" }]} />
          </>
        }>
        <FSearch value={q} onChange={setQ} placeholder="Kelompok, topik, ruangan, atau nomor" />
        <FDateRange where="main" from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <FSelect label="Kelompok" value={groupId} onChange={setGroupId} allLabel="Semua kelompok" options={opts?.groups.map((g) => ({ value: g.id, label: g.name }))} />
        <FSelect label="Keanggotaan" value={mine} onChange={setMine} allLabel="Semua rapat" options={[{ value: "true", label: "Kelompok saya" }]} />
      </FilterBar>

      {list.error && <Alert>{list.error}</Alert>}

      <section className={listCard} aria-busy={list.loading}>
        {list.items === null && <p className="px-6 py-10 text-center text-sm font-semibold text-[var(--ink-2)]">Memuat…</p>}
        {list.items?.length === 0 && !list.error && <p className="px-6 py-10 text-center text-sm font-semibold text-[var(--ink-2)]">{empty}</p>}
        {list.items?.map((m) => {
          const d = ymd(m.startsAt);
          const cancelled = m.status === "CANCELLED";
          return (
            <Link key={m.id} href={`/rapat/${m.id}`} className="flex items-center gap-3 border-b border-[var(--line-2)] px-4 py-3.5 md:gap-4 md:px-5 last:border-b-0 hover:bg-[#f6f7fe]">
              <div className="flex h-[62px] w-14 flex-none flex-col items-center justify-center rounded-t-[26px] rounded-b-[9px] leading-[1.1]" style={{ background: RAPAT.bg, color: RAPAT.fg, border: `1.5px solid ${RAPAT.dot}` }}>
                <span className="text-[10.5px] font-bold uppercase tracking-[0.06em]">{WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]}</span>
                <span className="text-[22px] font-extrabold">{d.slice(8)}</span>
                <span className="text-[10.5px] font-bold">{MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)}{d.slice(0, 4) !== ymd(new Date()).slice(0, 4) ? ` ${d.slice(2, 4)}` : ""}</span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={`text-[15px] font-extrabold max-md:line-clamp-2 md:truncate ${cancelled ? "line-through opacity-60" : ""}`}>{m.displayTitle}</span>
                <span className="text-[13px] font-semibold text-[var(--ink-2)]">{hm(m.startsAt)}–{hm(m.endsAt)} · {m.room.name}{m.room.floor !== null ? ` · ${floorText(m.room.floor)}` : ""}</span>
                {(cancelled || m.isMember) && <span className="flex gap-1.5 md:hidden">
                  {cancelled && <span className="whitespace-nowrap rounded-full bg-[#fbe4e4] px-2.5 py-[3px] text-xs font-bold text-[#9b1c1c]">Dibatalkan</span>}
                  {m.isMember && !cancelled && <span className="whitespace-nowrap rounded-full bg-[var(--primary-soft)] px-2.5 py-[3px] text-xs font-bold text-[var(--primary-ink)]">Kelompok saya</span>}
                </span>}
              </div>
              {cancelled && <span className="whitespace-nowrap hidden flex-none md:inline-block rounded-full bg-[#fbe4e4] px-2.5 py-[3px] text-xs font-bold text-[#9b1c1c]">Dibatalkan</span>}
              {m.isMember && !cancelled && <span className="whitespace-nowrap hidden flex-none md:inline-block rounded-full bg-[var(--primary-soft)] px-2.5 py-[3px] text-xs font-bold text-[var(--primary-ink)]">Kelompok saya</span>}
            </Link>
          );
        })}
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} noun="rapat" />
      </section>
    </div>
  );
}
