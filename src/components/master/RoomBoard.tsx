"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import RoomManager, { RoomDialog } from "./RoomManager";
import { callApi, errMsg, hmInput, inputCls } from "@/components/jadwal/api";
import { FilterBar, FSearch, FSelect } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import RoomOptions from "@/components/ui/RoomOptions";
import { useClientPaging } from "@/components/ui/usePagedList";
import { floorText, MONTHS, REHEARSAL_TONE, toneFor, ymd } from "@/lib/ui";

type Item = { kind: "EVENT" | "REHEARSAL"; eventId: string; title: string; number: string; status: string; seq: number | null; startsAt: string; endsAt: string; meeting?: boolean };
type Room = { id: string; name: string; floor: number | null; isActive: boolean; items: Item[] };
type Avail = { available: boolean; roomName: string; conflicts: string[]; inactive: boolean };

const FROM = 6 * 60;
const TO = 22 * 60;
const SPAN = TO - FROM;
const HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22];
const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
export const NEW_ROOM_EVENT = "rooms:new";

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const chipLabel = (iso: string) => `${DAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()]} ${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;
const dot = (hhmm: string) => hhmm.replace(":", ".");
/** Menit sejak 00:00 pada tanggal terpilih (acara yang melewati tengah malam dipotong di tepi hari). */
const dayMin = (iso: string, date: string) => {
  const d = ymd(iso);
  if (d < date) return 0;
  if (d > date) return 1440;
  const [h, m] = hmInput(iso).split(":").map(Number);
  return h * 60 + m;
};

export default function RoomBoard({ canManage, canOpenEvents = true }: { canManage: boolean; canOpenEvents?: boolean }) {
  const today = ymd(new Date());
  const [date, setDate] = useState(today);
  const [strip, setStrip] = useState(today);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [listVersion, setListVersion] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [boardQ, setBoardQ] = useState("");
  const [boardFloor, setBoardFloor] = useState("");

  const [checkRoom, setCheckRoom] = useState("");
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("12:00");
  const [avail, setAvail] = useState<Avail | null>(null);
  const [availErr, setAvailErr] = useState("");

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    void callApi("GET", `/api/v1/rooms/usage?date=${date}`).then((r) => {
      if (!live) return;
      if (r.ok) { setRooms(r.data.rooms); setError(""); } else setError(errMsg(r.data));
    });
    return () => { live = false; };
  }, [date, version]);

  const active = useMemo(() => (rooms ?? []).filter((r) => r.isActive), [rooms]);
  const floors = useMemo(() => [...new Set((rooms ?? []).map((r) => r.floor).filter((f): f is number => f !== null))].sort((a, b) => a - b), [rooms]);
  const shown = useMemo(() => (rooms ?? []).filter((r) =>
    (!boardQ.trim() || r.name.toLowerCase().includes(boardQ.trim().toLowerCase())) &&
    (!boardFloor || (boardFloor === "NONE" ? r.floor === null : r.floor === Number(boardFloor)))), [rooms, boardQ, boardFloor]);
  const boardPage = useClientPaging(shown);
  useEffect(() => { if (!checkRoom && active[0]) setCheckRoom(active[0].id); }, [active, checkRoom]);

  useEffect(() => {
    if (!checkRoom) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await callApi("GET", `/api/v1/rooms/availability?roomId=${checkRoom}&date=${date}&start=${start}&end=${end}`);
      if (!live) return;
      if (r.ok) { setAvail(r.data); setAvailErr(""); } else { setAvail(null); setAvailErr(errMsg(r.data)); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [checkRoom, date, start, end, version]);

  useEffect(() => {
    const open = () => setNewOpen(true);
    window.addEventListener(NEW_ROOM_EVENT, open);
    return () => window.removeEventListener(NEW_ROOM_EVENT, open);
  }, []);

  const days = Array.from({ length: 7 }, (_, i) => addDays(strip, i));
  const pickDate = (d: string) => { setDate(d); if (d < strip || d > addDays(strip, 6)) setStrip(d); };

  return (
    <div className="flex flex-col gap-5">
      {/* Pilih tanggal dan saring ruangan: keduanya menempel di bawah header */}
      <FilterBar active={!!(boardQ || boardFloor)} onReset={() => { setBoardQ(""); setBoardFloor(""); }}
        lead={
          <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setStrip(addDays(strip, -7))} aria-label="Pekan sebelumnya" className="grid size-10 place-items-center rounded-xl border border-[var(--line)] bg-white font-bold hover:bg-[#f3f4f9]">‹</button>
        {days.map((d) => (
          <button key={d} type="button" onClick={() => setDate(d)} aria-pressed={d === date}
            className={`h-[46px] rounded-xl border px-4 text-sm font-semibold ${d === date ? "border-[var(--primary)] bg-[var(--primary-soft)] font-bold text-[var(--primary-ink)]" : "border-[var(--line)] bg-white hover:bg-[#f3f4f9]"}`}>
            {chipLabel(d)}{d === today ? " · hari ini" : ""}
          </button>
        ))}
        <button type="button" onClick={() => setStrip(addDays(strip, 7))} aria-label="Pekan berikutnya" className="grid size-10 place-items-center rounded-xl border border-[var(--line)] bg-white font-bold hover:bg-[#f3f4f9]">›</button>
        <input type="date" value={date} onChange={(e) => e.target.value && pickDate(e.target.value)} aria-label="Pilih tanggal" className="h-[46px] rounded-xl border border-[var(--line)] bg-white px-3 text-sm font-semibold" />
      </div>
        }>
        {rooms && rooms.length > 0 && (
          <>
              <FSearch label="Cari ruangan" value={boardQ} onChange={setBoardQ} placeholder="Kode ruangan, mis. 401A" />
              <FSelect label="Lantai" value={boardFloor} onChange={setBoardFloor} allLabel="Semua lantai" width="w-44">
                {floors.map((f) => <option key={f} value={f}>{floorText(f)}</option>)}
                {rooms.some((r) => r.floor === null) && <option value="NONE">Belum diisi</option>}
              </FSelect>
          </>
        )}
      </FilterBar>

      {/* Pemakaian */}
      <section className="rounded-[20px] border border-[var(--line)] bg-white p-[22px]">
        <Heading>Pemakaian ruangan</Heading>
        {error && <p className="mt-4 rounded-xl border border-[#F2C9C9] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#9B1C1C]" role="alert">{error}</p>}
        {!rooms && !error && <p className="mt-4 text-sm text-[var(--ink-2)]">Memuat…</p>}
        {rooms && rooms.length === 0 && <p className="mt-4 text-sm font-semibold text-[var(--ink-2)]">Belum ada ruangan.{canManage ? " Tambahkan lewat tombol “Ruangan baru”." : ""}</p>}
        {rooms && rooms.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <div className="flex min-w-[720px] flex-col gap-3">
              <div className="grid grid-cols-[140px_1fr] gap-3">
                <span />
                <div className="relative h-5">
                  {HOURS.map((h) => (
                    <span key={h} className="absolute -translate-x-1/2 text-xs font-bold text-[var(--ink-2)]" style={{ left: `${((h * 60 - FROM) / SPAN) * 100}%` }}>{String(h).padStart(2, "0")}.00</span>
                  ))}
                </div>
              </div>
              {shown.length === 0 && <p className="py-4 text-sm font-semibold text-[var(--ink-2)]">Tidak ada ruangan yang cocok dengan filter ini.</p>}
              {boardPage.slice.map((r) => <RoomRow key={r.id} room={r} date={date} canOpenEvents={canOpenEvents} />)}
            </div>
          </div>
        )}
        {rooms && rooms.length > 0 && shown.length > 0 && (
          <Pager className="mt-4 rounded-xl border" page={boardPage.page} pageSize={boardPage.pageSize} total={boardPage.total} onPage={boardPage.setPage} onPageSize={boardPage.setPageSize} noun="ruangan" />
        )}
      </section>

      {/* Cek ketersediaan */}
      {active.length > 0 && (
        <section className="rounded-[20px] border border-[var(--line)] bg-white p-[22px]">
          <Heading>Cek ketersediaan · {chipLabel(date)}</Heading>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--ink-2)]">Ruangan
              <select className={`${inputCls} !w-52`} value={checkRoom} onChange={(e) => setCheckRoom(e.target.value)}><RoomOptions rooms={active} /></select>
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--ink-2)]">Mulai<input type="time" className={`${inputCls} !w-36`} value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="flex flex-col gap-1.5 text-xs font-semibold text-[var(--ink-2)]">Selesai<input type="time" className={`${inputCls} !w-36`} value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          <div className="mt-4" aria-live="polite">
            {availErr && <Banner tone="warn">{availErr}</Banner>}
            {avail && avail.inactive && <Banner tone="warn">{avail.roomName} sedang dinonaktifkan.</Banner>}
            {avail && !avail.inactive && avail.available && <Banner tone="ok">{avail.roomName} kosong pada {dot(start)}–{dot(end)}. Siap dipakai.</Banner>}
            {avail && !avail.inactive && !avail.available && <Banner tone="bad">{avail.roomName} bentrok dengan {avail.conflicts.join("; ")}. Pilih ruangan atau jam lain.</Banner>}
          </div>
        </section>
      )}

      {/* Daftar ruangan */}
      <section className="rounded-[20px] border border-[var(--line)] bg-white p-[22px]">
        <Heading>Daftar ruangan</Heading>
        <div className="mt-4"><RoomManager canManage={canManage} version={listVersion} onChange={reload} /></div>
      </section>

      {newOpen && <RoomDialog room={null} onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); reload(); setListVersion((v) => v + 1); }} />}
    </div>
  );
}

const Heading = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3">
    <h2 className="text-[13px] font-extrabold uppercase tracking-[0.07em] text-[var(--gold-ink)]">{children}</h2>
    <span className="h-px flex-1 bg-[#E8E4D6]" />
  </div>
);

const Banner = ({ tone, children }: { tone: "ok" | "bad" | "warn"; children: React.ReactNode }) => (
  <p className={`flex items-center gap-2.5 rounded-xl px-4 py-3.5 text-sm font-bold ${tone === "ok" ? "bg-[#E3F4E8] text-[#1B6B34]" : tone === "bad" ? "bg-[#FDE8E8] text-[#9B1C1C]" : "bg-[#FFFBF0] text-[#6F4304]"}`}>{children}</p>
);

function RoomRow({ room, date, canOpenEvents }: { room: Room; date: string; canOpenEvents: boolean }) {
  // tempatkan blok yang beririsan di baris (lajur) berbeda
  const placed = useMemo(() => {
    const lanes: number[] = [];
    const vis: { it: Item; s: number; e: number; lane: number }[] = [];
    const hidden: Item[] = [];
    for (const it of [...room.items].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
      const s = Math.max(dayMin(it.startsAt, date), FROM);
      const e = Math.min(dayMin(it.endsAt, date), TO);
      if (e <= s) { hidden.push(it); continue; }
      let lane = lanes.findIndex((end) => end <= s);
      if (lane === -1) { lane = lanes.length; lanes.push(e); } else lanes[lane] = e;
      vis.push({ it, s, e, lane });
    }
    return { vis, hidden, count: Math.max(lanes.length, 1) };
  }, [room.items, date]);

  const H = 52;
  const height = placed.count * (H + 6) + 6;
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
      <div className="flex flex-col leading-tight">
        <span className="text-[15px] font-extrabold">{room.name}{room.isActive ? "" : " (nonaktif)"}</span>
        <span className="text-xs font-medium text-[var(--ink-2)]">{[floorText(room.floor), room.items.length === 0 ? "Kosong" : `${room.items.length} pemakaian`].filter(Boolean).join(" · ")}</span>
      </div>
      <div>
        <div className="relative rounded-xl border border-[var(--line)] bg-[var(--surface-2)]" style={{ height, backgroundImage: "repeating-linear-gradient(to right, var(--line-2) 0 1px, transparent 1px 12.5%)" }}>
          {placed.vis.map(({ it, s, e, lane }) => {
            const tone = it.kind === "REHEARSAL" ? REHEARSAL_TONE : toneFor(it.title);
            const label = it.kind === "REHEARSAL" ? `Latihan ${it.seq} · ${it.title.replace(/^ibadah\s+/i, "")}` : toneFor(it.title).short;
            const time = `${dot(hmInput(it.startsAt))}–${dot(hmInput(it.endsAt))}`;
            const clickable = it.meeting || canOpenEvents;
            const cls = `absolute flex flex-col justify-center overflow-hidden rounded-[10px] px-2.5 leading-tight ${clickable ? "hover:brightness-95" : "cursor-default"}`;
            const style = {
              left: `${((s - FROM) / SPAN) * 100}%`, width: `${Math.max(((e - s) / SPAN) * 100, 3)}%`, top: 6 + lane * (H + 6), height: H,
              background: tone.bg, color: tone.fg, border: `1.5px ${it.status === "DRAFT" ? "dashed" : "solid"} ${tone.dot}`,
            };
            const title = `${it.title} (${it.number})${it.status === "DRAFT" ? " · Draf" : ""}`;
            const inner = (
              <>
                <span className="truncate text-[13px] font-extrabold">{label}</span>
                <span className="truncate text-xs font-semibold">{time}</span>
              </>
            );
            const key = `${it.kind}-${it.eventId}-${it.startsAt}`;
            return clickable ? (
              <Link key={key} href={it.meeting ? `/rapat/${it.eventId}` : `/jadwal/${it.eventId}`} title={title} className={cls} style={style}>{inner}</Link>
            ) : (
              <div key={key} title={title} className={cls} style={style}>{inner}</div>
            );
          })}
        </div>
        {placed.hidden.length > 0 && (
          <p className="mt-1 text-xs font-medium text-[var(--ink-2)]">Di luar 06.00–22.00: {placed.hidden.map((h) => `${h.title} (${dot(hmInput(h.startsAt))}–${dot(hmInput(h.endsAt))})`).join("; ")}</p>
        )}
      </div>
    </div>
  );
}
