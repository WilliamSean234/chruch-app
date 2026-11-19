"use client";

import { stickyPage } from "@/components/ui/sticky";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PersonFilter, { type PersonLite } from "@/components/PersonFilter";
import ServiceSummary from "./ServiceSummary";
import AssignDropDialog, { type DropPerms, type DropPerson } from "./AssignDropDialog";
import { dayLong, dayShort, hm, MONTHS, monthGrid, REHEARSAL_TONE, STATUS_LABEL, toneFor, WEEKDAYS, ymd } from "@/lib/ui";

type CalEvent = {
  id: string; number: string; title: string; status: string; startsAt: string; endsAt: string; room: { id: string; name: string };
  teams: string[]; seatsTotal: number; seatsFilled: number; mySeat: string | null; canAttend?: boolean;
};
type CalRehearsal = { id: string; eventId: string; eventTitle: string; seq: number; startsAt: string; endsAt: string; room: { name: string }; mine: boolean };
type Detail = {
  createdBy: string | null; createdAt: string;
  id: string; number: string; title: string; status: string; startsAt: string; endsAt: string; room: { name: string };
  teams: { teamTypeId: string; name: string }[];
  seats: { id: string; teamTypeId: string; label: string; ministryName: string; rehearsalRequired: boolean; person: { id: string; name: string; origin: string; originChurch: string | null } | null }[];
  rehearsals: { id: string; seq: number; startsAt: string; endsAt: string; room: { name: string }; note: string | null }[];
};
type CalMeeting = {
  id: string; number: string; status: string; startsAt: string; endsAt: string; room: { id: string; name: string };
  group: { id: string; name: string }; displayTitle: string; isMember: boolean; canManage: boolean;
};
type Team = { id: string; name: string };
type AgendaRow = { key: string; kind: "E" | "R" | "M"; id: string; eventId?: string; title: string; sub: string; start: string; end: string; dot: string; cancelled?: boolean; draft?: boolean };
const RAPAT_TONE = { bg: "#F8E6DD", fg: "#7A3A1E", dot: "#C0562D" };

const nowParts = () => { const [y, m] = ymd(new Date()).split("-").map(Number); return { y, m0: m - 1 }; };

export default function CalendarView({ canFilter, canEdit, hasPerson, myPersonId, drop = null, canSeeMeetings = false }: {
  /** Boleh melihat rapat? (Penjadwal, Superadmin, anggota kelompok). Kalau tidak: tidak ada rapat dan tidak ada tombolnya. */
  canSeeMeetings?: boolean;
  canFilter: boolean; canEdit: boolean; hasPerson: boolean; myPersonId: string | null;
  /** Hak untuk menjadwalkan lewat drag & drop (null = tidak boleh). */
  drop?: DropPerms | null;
}) {
  const start = useMemo(nowParts, []);
  const [year, setYear] = useState(start.y);
  const [month0, setMonth0] = useState(start.m0);
  const [mine, setMine] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [person, setPerson] = useState<PersonLite | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [rehearsals, setRehearsals] = useState<CalRehearsal[]>([]);
  const [meetings, setMeetings] = useState<CalMeeting[]>([]);
  const [meetingGroups, setMeetingGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupId, setGroupId] = useState("");
  const [selMeeting, setSelMeeting] = useState<string | null>(null);
  // Tampilkan/sembunyikan rapat di kalender (hanya untuk yang boleh melihat rapat); klik tombol hanya berlaku selama halaman terbuka.
  const [showMeetings, setShowMeetings] = useState(canSeeMeetings);
  const toggleMeetings = () => {
    const next = !showMeetings;
    setShowMeetings(next);
    if (!next) setSelMeeting(null);
  };
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedRehearsal, setSelectedRehearsal] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Tampilan HP (seperti kalender iPhone): kotak bulan hanya berisi titik warna; ketuk tanggal untuk melihat agenda, ketuk agenda untuk rincian.
  const asideRef = useRef<HTMLElement>(null);
  const [sheet, setSheet] = useState(false); // rincian terbuka (hanya berpengaruh di HP)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selDayRaw, setSelDayRaw] = useState<string | null>(null);

  // ── drag & drop: orang "belum dijadwalkan" → acara di kalender
  const [dragPerson, setDragPerson] = useState<DropPerson | null>(null);
  const [dropOver, setDropOver] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ person: DropPerson; eventId: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detailKey, setDetailKey] = useState(0);
  const [flash, setFlash] = useState("");
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 7000);
    return () => clearTimeout(t);
  }, [flash]);

  // Dipanggil dari rekap: klik nama → kalender hanya menampilkan jadwal orang itu. Klik lagi → filter dilepas.
  const pickPerson = useCallback((p: PersonLite | null) => {
    setMine(false); // "Jadwal saya" akan menimpa filter orang, jadi dimatikan
    setPerson(p);
    if (p) toolbarRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const grid =useMemo(() => monthGrid(year, month0), [year, month0]);
  const today = ymd(new Date());

  useEffect(() => {
    if (!canFilter) return;
    fetch("/api/v1/teams", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { items: [] })).then((d) => setTeams((d.items as Team[]).map((t) => ({ id: t.id, name: t.name }))));
  }, [canFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const p = new URLSearchParams({ from: grid[0].iso, to: grid[grid.length - 1].iso });
    if (mine) p.set("mine", "true");
    if (teamId) p.set("teamTypeId", teamId);
    if (person) p.set("personId", person.id);
    const r = await fetch(`/api/v1/events?${p}`, { cache: "no-store" });
    if (!r.ok) {
      setError((await r.json().catch(() => null))?.error?.message ?? "Gagal memuat kalender.");
      setEvents([]); setRehearsals([]); setMeetings([]);
    } else {
      const d = await r.json();
      setEvents(d.items); setRehearsals(d.rehearsals ?? []); setMeetings(d.meetings ?? []); setMeetingGroups(d.meetingGroups ?? []); setNote(d.note ?? "");
    }
    setLoading(false);
  }, [grid, mine, teamId, person]);
  useEffect(() => { void load(); }, [load]);

  // pilih otomatis acara terdekat bila pilihan lama tidak ada di bulan ini
  useEffect(() => {
    if (selected && selectedRehearsal && rehearsals.some((r) => r.id === selectedRehearsal)) return; // latihan bisa jatuh di bulan lain dari acaranya
    if (events.length === 0) { setSelected(null); setSelectedRehearsal(null); return; }
    if (selected && !selectedRehearsal && events.some((e) => e.id === selected)) return;
    const upcoming = events.find((e) => ymd(e.startsAt) >= today) ?? events[0];
    setSelected(upcoming.id); setSelectedRehearsal(null);
  }, [events, rehearsals, selected, selectedRehearsal, today]);

  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let live = true;
    fetch(`/api/v1/events/${selected}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live) setDetail(d); });
    return () => { live = false; };
  }, [selected, detailKey]);

  // filter "kelompok rapat": hanya rapat kelompok terpilih
  const shownMeetings = useMemo(() => (groupId ? meetings.filter((x) => x.group.id === groupId) : meetings), [meetings, groupId]);
  useEffect(() => { if (selMeeting && !shownMeetings.some((x) => x.id === selMeeting)) setSelMeeting(null); }, [shownMeetings, selMeeting]);

  const byDay = useMemo(() => {
    const m = new Map<string, { e: CalEvent[]; r: CalRehearsal[]; m: CalMeeting[] }>();
    const get = (k: string) => m.get(k) ?? m.set(k, { e: [], r: [], m: [] }).get(k)!;
    events.forEach((e) => get(ymd(e.startsAt)).e.push(e));
    rehearsals.forEach((r) => get(ymd(r.startsAt)).r.push(r));
    if (canSeeMeetings && showMeetings) shownMeetings.forEach((x) => get(ymd(x.startsAt)).m.push(x));
    return m;
  }, [events, rehearsals, shownMeetings, showMeetings, canSeeMeetings]);

  const move = (delta: number) => {
    const d = new Date(Date.UTC(year, month0 + delta, 1));
    setYear(d.getUTCFullYear()); setMonth0(d.getUTCMonth());
    setSheet(false);
  };

  // Tanggal terpilih di tampilan HP: bawaannya hari ini (bila di bulan ini), jika tidak tanggal 1.
  const monthKey = `${year}-${String(month0 + 1).padStart(2, "0")}`;
  const selDay = selDayRaw && selDayRaw.startsWith(monthKey) ? selDayRaw : today.startsWith(monthKey) ? today : `${monthKey}-01`;
  const agenda = useMemo<AgendaRow[]>(() => {
    const d = byDay.get(selDay);
    if (!d) return [];
    const rows: AgendaRow[] = [];
    d.e.forEach((e) => rows.push({ key: `e-${e.id}`, kind: "E", id: e.id, title: e.title, sub: `${e.room.name}${e.mySeat ? ` · Saya: ${e.mySeat}` : ""}`, start: e.startsAt, end: e.endsAt, dot: toneFor(e.title).dot, cancelled: e.status === "CANCELLED", draft: e.status === "DRAFT" }));
    d.r.forEach((r) => rows.push({ key: `r-${r.id}`, kind: "R", id: r.id, eventId: r.eventId, title: `Latihan ${r.seq} · ${r.eventTitle}`, sub: `${r.room.name}${r.mine ? " · Saya wajib hadir" : ""}`, start: r.startsAt, end: r.endsAt, dot: REHEARSAL_TONE.dot }));
    d.m.forEach((x) => rows.push({ key: `m-${x.id}`, kind: "M", id: x.id, title: x.displayTitle, sub: x.room.name, start: x.startsAt, end: x.endsAt, dot: RAPAT_TONE.dot }));
    return rows.sort((a, b) => a.start.localeCompare(b.start));
  }, [byDay, selDay]);
  const openRow = (r: AgendaRow) => {
    if (r.kind === "E") { setSelected(r.id); setSelectedRehearsal(null); setSelMeeting(null); }
    else if (r.kind === "R") { setSelected(r.eventId ?? null); setSelectedRehearsal(r.id); setSelMeeting(null); }
    else setSelMeeting(r.id);
    setSheet(true);
    setTimeout(() => asideRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };
  const rowOn = (r: AgendaRow) => sheet && (r.kind === "E" ? selected === r.id && !selectedRehearsal && !selMeeting : r.kind === "R" ? selectedRehearsal === r.id && !selMeeting : selMeeting === r.id);
  const activeFilters = [mine, teamId, person, groupId, canSeeMeetings && !showMeetings].filter(Boolean).length;

  const sections = useMemo(() => {
    if (!detail) return [];
    return detail.teams.map((t) => ({ title: t.name, seats: detail.seats.filter((s) => s.teamTypeId === t.teamTypeId) }));
  }, [detail]);

  const selEvent = events.find((e) => e.id === selected);
  const selRehearsal = detail && selectedRehearsal ? detail.rehearsals.find((r) => r.id === selectedRehearsal) : undefined;
  const tone = detail ? toneFor(detail.title) : null;
  const st = detail ? (STATUS_LABEL[detail.status] ?? STATUS_LABEL.DRAFT) : null;
  const seg = (on: boolean) => `h-[38px] rounded-[9px] px-4 text-[13.5px] font-bold ${on ? "bg-white text-[var(--primary-ink)] shadow-sm" : "text-[var(--ink-2)]"}`;

  return (
    <>
      <div ref={toolbarRef} className={`flex flex-wrap items-center gap-3 ${stickyPage}`}>
        <div className="flex items-center gap-1 rounded-xl bg-[#e7e9f3] p-1 max-md:flex-1" role="group" aria-label="Pilih bulan">
          <button onClick={() => move(-1)} className="grid size-[38px] place-items-center rounded-[9px] font-bold text-[var(--ink-2)] hover:bg-white/70" aria-label="Bulan sebelumnya">‹</button>
          <span className="min-w-36 px-2 text-center text-[14px] font-extrabold max-md:min-w-0 max-md:flex-1">{MONTHS[month0]} {year}</span>
          <button onClick={() => move(1)} className="grid size-[38px] place-items-center rounded-[9px] font-bold text-[var(--ink-2)] hover:bg-white/70" aria-label="Bulan berikutnya">›</button>
        </div>
        <button onClick={() => { setYear(start.y); setMonth0(start.m0); }} className="h-[46px] rounded-xl border border-[var(--line)] bg-white px-4 text-[13.5px] font-semibold">Hari ini</button>
        <button type="button" onClick={() => setFiltersOpen((v) => !v)} aria-expanded={filtersOpen}
          className={`flex h-[46px] items-center gap-2 rounded-xl border px-3.5 text-[13.5px] font-semibold md:hidden ${filtersOpen || activeFilters > 0 ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-ink)]" : "border-[var(--line)] bg-white"}`}>
          Filter{activeFilters > 0 && <span className="grid size-5 place-items-center rounded-full bg-[var(--primary)] text-[11px] font-extrabold text-white">{activeFilters}</span>}
        </button>
        <div className={`${filtersOpen ? "flex" : "hidden"} w-full flex-wrap items-center gap-3 md:contents`}>

        <div className="flex gap-0.5 rounded-xl bg-[#e7e9f3] p-1" role="group" aria-label="Tampilan jadwal">
          <button onClick={() => setMine(false)} className={seg(!mine)}>Semua jadwal</button>
          <button onClick={() => setMine(true)} className={seg(mine)} disabled={!hasPerson} title={hasPerson ? "" : "Akun belum dihubungkan ke data orang"}>Jadwal saya</button>
        </div>

        {canFilter && (
          <>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Filter tim" className="h-[46px] rounded-xl border border-[var(--line)] bg-white px-3 text-[13.5px] font-semibold">
              <option value="">Semua tim</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <PersonFilter value={person} onChange={setPerson} />
          </>
        )}

        {canSeeMeetings && <button type="button" onClick={toggleMeetings} aria-pressed={showMeetings}
          title={showMeetings ? "Sembunyikan rapat dari kalender" : "Tampilkan rapat di kalender"}
          className={`inline-flex h-[46px] items-center gap-2 rounded-xl border px-4 text-[13.5px] font-semibold ${showMeetings ? "border-[var(--line)] bg-white text-[var(--ink)]" : "border-dashed border-[var(--line)] bg-transparent text-[var(--ink-2)]"}`}>
          <span className="size-[9px] rounded-full" style={{ background: RAPAT_TONE.dot, opacity: showMeetings ? 1 : 0.35 }} aria-hidden="true" />
          {showMeetings ? "Rapat tampil" : "Rapat disembunyikan"}{shownMeetings.length > 0 && <span className="text-xs font-bold text-[var(--ink-2)]">({shownMeetings.length})</span>}
        </button>}
        {canSeeMeetings && showMeetings && meetingGroups.length > 0 && (
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Filter kelompok rapat" className="h-[46px] rounded-xl border border-[var(--line)] bg-white px-3 text-[13.5px] font-semibold">
            <option value="">Semua kelompok rapat</option>
            {meetingGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl bg-[#FBE4E4] px-4 py-3 text-sm font-semibold text-[#9B1C1C]">{error}</p>}
      {note && mine && <p className="rounded-xl bg-[var(--gold-soft)] px-4 py-3 text-sm font-semibold text-[#6F4304]">{note}</p>}
      {flash && (
        <p role="status" className="flex items-center justify-between gap-3 rounded-xl bg-[#E3F3E7] px-4 py-3 text-sm font-semibold text-[#1B6B34]">
          <span>{flash}</span>
          <button type="button" onClick={() => setFlash("")} className="rounded-lg px-2 py-1 text-xs font-bold hover:bg-white/60">Tutup</button>
        </p>
      )}
      {dialog && drop && (
        <AssignDropDialog
          person={dialog.person} eventId={dialog.eventId} perms={drop}
          onClose={() => setDialog(null)}
          onDone={(msg) => {
            const id = dialog.eventId;
            setDialog(null); setFlash(msg);
            setSelected(id); setSelectedRehearsal(null); setSelMeeting(null);
            setDetailKey((k) => k + 1); setRefreshKey((k) => k + 1);
            void load();
          }}
        />
      )}

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-5 max-md:contents">
        <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white max-md:order-1 max-md:w-full" aria-busy={loading}>
          {/* HP: hanya titik warna per tanggal, seperti kalender iPhone */}
          <div className="md:hidden">
            <div className="grid grid-cols-7 border-b border-[var(--line)] bg-[var(--surface-2)]">
              {WEEKDAYS.map((w, i) => <div key={w} className={`py-2 text-center text-[11px] font-bold tracking-[0.04em] ${i === 0 ? "text-[var(--gold-ink)]" : "text-[var(--ink-2)]"}`}>{w}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {grid.map((c) => {
                if (!c.inMonth) return <div key={c.iso} className="h-[60px] border-b border-[var(--line-2)]" aria-hidden="true" />;
                const d = byDay.get(c.iso);
                const dots: string[] = [];
                d?.e.forEach((e) => { const col = toneFor(e.title).dot; if (!dots.includes(col)) dots.push(col); });
                if (d?.r.length && !dots.includes(REHEARSAL_TONE.dot)) dots.push(REHEARSAL_TONE.dot);
                if (d?.m.length && !dots.includes(RAPAT_TONE.dot)) dots.push(RAPAT_TONE.dot);
                const count = d ? d.e.length + d.r.length + d.m.length : 0;
                const isToday = c.iso === today;
                const on = c.iso === selDay;
                return (
                  <button key={c.iso} type="button" onClick={() => { setSelDayRaw(c.iso); setSheet(false); }} aria-pressed={on}
                    aria-label={`${dayLong(c.iso)}${count ? `, ${count} kegiatan` : ""}`}
                    className="flex h-[60px] flex-col items-center gap-1 border-b border-[var(--line-2)] pt-1.5">
                    <span className={`grid size-8 place-items-center rounded-full text-[15px] font-bold ${isToday ? "bg-[var(--primary)] text-white" : on ? "bg-[var(--primary-soft)] text-[var(--primary-ink)] ring-2 ring-[var(--primary)]" : c.weekday === 0 ? "text-[var(--gold-ink)]" : "text-[var(--ink)]"}`}>{c.day}</span>
                    <span className="flex h-[6px] items-center gap-[3px]" aria-hidden="true">
                      {dots.slice(0, 4).map((col) => <span key={col} className="size-[6px] rounded-full" style={{ background: col }} />)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="hidden overflow-x-auto md:block">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-7 border-b border-[var(--line)] bg-[var(--surface-2)]">
                {WEEKDAYS.map((w, i) => (
                  <div key={w} className={`px-3.5 py-3 text-xs font-bold tracking-[0.06em] ${i === 0 ? "text-[var(--gold-ink)]" : "text-[var(--ink-2)]"}`}>{w}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {grid.map((c) => {
                  const d = byDay.get(c.iso);
                  const isToday = c.iso === today;
                  return (
                    <div key={c.iso} className={`flex min-h-[136px] flex-col gap-[5px] border-b border-r border-[var(--line-2)] p-2 pt-2.5 ${c.inMonth ? (c.weekday === 0 ? "bg-[#FFFCF5]" : "bg-white") : "bg-[var(--surface-2)]"}`}>
                      <span className={`grid h-[26px] min-w-[26px] place-items-center self-start rounded-full px-1 text-[13px] font-bold ${isToday ? "bg-[var(--primary)] text-white" : c.inMonth ? "text-[var(--ink)]" : "text-[#A9ADC3]"}`}>{c.day}</span>
                      {d?.e.map((e) => {
                        const t = toneFor(e.title);
                        const cancelled = e.status === "CANCELLED";
                        const droppable = !!dragPerson && !cancelled;
                        const over = droppable && dropOver === e.id;
                        return (
                          <button key={e.id} onClick={() => { setSelected(e.id); setSelectedRehearsal(null); setSelMeeting(null); }}
                            onDragOver={(ev) => { if (droppable) { ev.preventDefault(); ev.dataTransfer.dropEffect = "copy"; } }}
                            onDragEnter={() => { if (droppable) setDropOver(e.id); }}
                            onDragLeave={() => setDropOver((cur) => (cur === e.id ? null : cur))}
                            onDrop={(ev) => {
                              ev.preventDefault();
                              setDropOver(null);
                              if (droppable && dragPerson) { setDialog({ person: dragPerson, eventId: e.id }); setDragPerson(null); }
                            }}
                            className={`flex min-h-[30px] w-full items-center gap-1.5 rounded-lg px-2 py-[3px] text-left text-[11.5px] font-bold leading-tight transition-transform hover:brightness-95 ${cancelled ? "line-through" : ""} ${e.status === "DRAFT" ? "outline-dashed outline-1 outline-offset-[-1px]" : ""} ${dragPerson ? "[&_*]:pointer-events-none" : ""} ${over ? "scale-[1.03]" : ""}`}
                            style={{
                              background: t.bg, color: t.fg, outlineColor: t.dot,
                              boxShadow: over ? `0 0 0 3px ${t.dot}, 0 8px 16px -8px ${t.dot}` : droppable ? `0 0 0 1.5px ${t.dot}99` : e.id === selected && !selectedRehearsal ? `0 0 0 2px ${t.dot}` : undefined,
                              opacity: dragPerson && !cancelled ? 1 : c.iso < today ? 0.62 : 1,
                            }}
                            title={`${e.title} — ${e.room.name}${e.mySeat ? ` · Saya: ${e.mySeat}` : ""}`}>
                            <span className="size-[7px] flex-none rounded-full" style={{ background: t.dot }} aria-hidden="true" />
                            <span className="min-w-0 truncate">{hm(e.startsAt)} {t.short}</span>
                            {e.mySeat && <span className="whitespace-nowrap ml-auto flex-none rounded-full bg-white/70 px-1.5 text-[10px]">Saya</span>}
                          </button>
                        );
                      })}
                      {d?.m.map((x) => (
                        <button key={x.id} onClick={() => setSelMeeting(x.id)} title={`${x.displayTitle} — ${x.room.name}`}
                          className="flex min-h-[30px] w-full items-start gap-1.5 rounded-lg px-2 py-1 text-left text-[11.5px] font-bold leading-tight hover:brightness-95"
                          style={{ background: RAPAT_TONE.bg, color: RAPAT_TONE.fg, boxShadow: x.id === selMeeting ? `0 0 0 2px ${RAPAT_TONE.dot}` : undefined, opacity: c.iso < today ? 0.62 : 1 }}>
                          <span className="mt-[3px] size-[7px] flex-none rounded-full" style={{ background: RAPAT_TONE.dot }} aria-hidden="true" />
                          <span className="min-w-0 break-words">{hm(x.startsAt)} {x.displayTitle}</span>
                        </button>
                      ))}
                      {d?.r.map((r) => (
                        <button key={r.id} onClick={() => { setSelected(r.eventId); setSelectedRehearsal(r.id); setSelMeeting(null); }} title={`Latihan ${r.seq} — ${r.eventTitle} (${r.room.name})${r.mine ? " · Saya wajib hadir" : ""}`}
                          className="flex min-h-[30px] w-full items-center gap-1.5 rounded-lg px-2 py-[3px] text-left text-[11.5px] font-bold leading-tight hover:brightness-95"
                          style={{ background: REHEARSAL_TONE.bg, color: REHEARSAL_TONE.fg, boxShadow: r.id === selectedRehearsal ? `0 0 0 2px ${REHEARSAL_TONE.dot}` : undefined, opacity: c.iso < today ? 0.62 : 1 }}>
                          <span className="size-[7px] flex-none rounded-full" style={{ background: REHEARSAL_TONE.dot }} aria-hidden="true" />
                          <span className="min-w-0 truncate">{hm(r.startsAt)} Latihan</span>
                          {r.mine && <span className="whitespace-nowrap ml-auto flex-none rounded-full bg-white/70 px-1.5 text-[10px]">Saya</span>}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-[18px] border-t border-[var(--line)] px-[18px] py-3.5 text-[12.5px] font-semibold text-[var(--ink-2)]">
            {[["Minggu I", "#3037A8"], ["Minggu II", "#8E2E99"], ["Mandarin", "#B7791F"], ["Fellowship", "#0F766E"], ["Latihan", "#6B7090"], ...(canSeeMeetings && showMeetings ? [["Rapat", "#C0562D"]] : [])].map(([l, c]) => (
              <span key={l} className="flex items-center gap-[7px]"><span className="size-[9px] rounded-full" style={{ background: c }} />{l}</span>
            ))}
            <span className="flex-1" />
            <span>{loading ? "Memuat…" : `${events.length} acara · ${rehearsals.length} latihan${canSeeMeetings && showMeetings && shownMeetings.length ? ` · ${shownMeetings.length} rapat` : ""}`}</span>
          </div>
        </section>
        {/* HP: agenda untuk tanggal yang diketuk */}
        <section aria-label="Agenda tanggal terpilih" className="flex flex-col gap-2.5 md:hidden max-md:order-2 max-md:w-full">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-extrabold uppercase tracking-[0.07em] text-[var(--gold-ink)]">{dayLong(selDay)}</span>
            <span className="h-px flex-1 bg-[#E8E4D6]" />
          </div>
          {agenda.length === 0 ? (
            <p className="rounded-2xl border border-[var(--line)] bg-white px-4 py-6 text-center text-sm font-semibold text-[var(--ink-2)]">{loading ? "Memuat…" : "Tidak ada kegiatan pada tanggal ini."}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-white p-0">
              {agenda.map((r) => (
                <li key={r.key} className="border-b border-[var(--line-2)] last:border-b-0">
                  <button type="button" onClick={() => openRow(r)} aria-pressed={rowOn(r)}
                    className={`flex w-full items-stretch gap-3 px-4 py-3 text-left ${rowOn(r) ? "bg-[var(--primary-soft)]" : ""}`}>
                    <span className="w-1 flex-none rounded-full" style={{ background: r.dot, opacity: r.cancelled ? 0.4 : 1 }} aria-hidden="true" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={`text-[15px] font-extrabold leading-snug ${r.cancelled ? "line-through" : ""}`}>{r.title}</span>
                      <span className="text-[13px] font-medium text-[var(--ink-2)]">{r.sub}{r.draft ? " · Draf" : ""}{r.cancelled ? " · Dibatalkan" : ""}</span>
                    </span>
                    <span className="flex flex-none flex-col items-end text-[13.5px] font-semibold tabular-nums"><span>{hm(r.start)}</span><span className="text-[var(--ink-2)]">{hm(r.end)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="max-md:order-4 max-md:w-full">
          <ServiceSummary year={year} month0={month0} teamId={canFilter ? teamId : ""} myPersonId={myPersonId} activePersonId={person?.id ?? null} onPickPerson={pickPerson}
            canDrag={!!drop} onDragPerson={setDragPerson} refreshKey={refreshKey} />
        </div>
        </div>

        <aside ref={asideRef} className={`${sheet ? "" : "max-md:hidden"} lg:sticky lg:top-[calc(var(--header-h)+16px)] lg:max-h-[calc(100vh-var(--header-h)-32px)] lg:self-start lg:overflow-y-auto flex min-w-[300px] max-w-[400px] flex-[1_1_320px] flex-col gap-[18px] rounded-[20px] border border-[var(--line)] bg-white p-[22px] max-md:order-3 max-md:w-full max-md:min-w-0 max-md:max-w-none max-md:scroll-mt-28`} aria-live="polite">
          <button type="button" onClick={() => setSheet(false)} className="-mb-2 flex h-9 items-center gap-1.5 self-end rounded-lg px-2.5 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)] md:hidden">Tutup ✕</button>
          {selMeeting ? (
            <MeetingPanel id={selMeeting} onClose={() => setSelMeeting(null)} />
          ) : !detail || !tone || !st ? (
            <p className="py-10 text-center text-sm font-semibold text-[var(--ink-2)]">{events.length === 0 && (!canSeeMeetings || !showMeetings || shownMeetings.length === 0) && !loading ? "Tidak ada acara pada tampilan ini." : "Pilih acara di kalender untuk melihat detailnya."}</p>
          ) : selRehearsal ? (
            <RehearsalPanel detail={detail} reh={selRehearsal} myPersonId={myPersonId} canEdit={canEdit} onBack={() => setSelectedRehearsal(null)} />
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="flex h-[76px] w-16 flex-none flex-col items-center justify-center rounded-t-[32px] rounded-b-[10px] leading-[1.1]" style={{ background: tone.bg, color: tone.fg, border: `1.5px solid ${tone.dot}` }}>
                  <span className="text-[11px] font-bold uppercase tracking-[0.06em]">{WEEKDAYS[new Date(`${ymd(detail.startsAt)}T00:00:00Z`).getUTCDay()]}</span>
                  <span className="text-[26px] font-extrabold">{ymd(detail.startsAt).slice(8)}</span>
                  <span className="text-[11px] font-bold">{MONTHS[Number(ymd(detail.startsAt).slice(5, 7)) - 1].slice(0, 3)}</span>
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h2 className="text-[19px] font-extrabold leading-tight tracking-tight">{detail.title}</h2>
                  <span className="whitespace-nowrap self-start rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: st.bg, color: st.fg }}>{st.text}</span>
                </div>
              </div>
              <p className="-mt-2 text-xs font-semibold text-[var(--ink-2)]">{dayLong(detail.startsAt)} · {detail.number}</p>
              {detail.createdBy && <p className="-mt-3 text-xs font-medium text-[var(--ink-2)]">Jadwal dibuat oleh <b className="font-bold text-[var(--ink)]">{detail.createdBy}</b> · {dayShort(detail.createdAt)}</p>}
              <div className="flex gap-2.5">
                <div className="flex flex-1 flex-col gap-0.5 rounded-xl bg-[var(--bg)] px-3 py-2.5"><span className="text-[11.5px] font-semibold text-[var(--ink-2)]">Waktu</span><span className="text-sm font-bold">{hm(detail.startsAt)}–{hm(detail.endsAt)}</span></div>
                <div className="flex flex-1 flex-col gap-0.5 rounded-xl bg-[var(--bg)] px-3 py-2.5"><span className="text-[11.5px] font-semibold text-[var(--ink-2)]">Ruangan</span><span className="text-sm font-bold">{detail.room.name}</span></div>
              </div>

              {sections.map((s) => (
                <div key={s.title} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-extrabold uppercase tracking-[0.07em] text-[var(--gold-ink)]">{s.title}</span>
                    <span className="h-px flex-1 bg-[#E8E4D6]" />
                  </div>
                  {s.seats.length === 0 && <p className="text-[13px] text-[var(--ink-2)]">Belum ada kursi.</p>}
                  {s.seats.map((seat) => (
                    <div key={seat.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-[var(--ink-2)]">{seat.label}</span>
                      <span className="flex items-center gap-2 text-right font-bold">
                        {seat.person && myPersonId && seat.person.id === myPersonId && <span className="whitespace-nowrap rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary-ink)]">Saya</span>}
                        {seat.person ? seat.person.name : <span className="font-semibold italic text-[#B7791F]">Belum diisi</span>}
                        {seat.person && seat.ministryName === "Pembicara" && (
                          <span className="whitespace-nowrap rounded-full bg-[var(--gold-soft)] px-2 py-0.5 text-[11px] font-bold text-[#6F4304]" title={seat.person.originChurch ?? undefined}>{seat.person.origin === "LUAR" ? "Luar" : "Dalam"}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ))}

              {detail.rehearsals.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xs font-extrabold uppercase tracking-[0.07em] text-[var(--gold-ink)]">Latihan</span>
                    <span className="h-px flex-1 bg-[#E8E4D6]" />
                  </div>
                  {detail.rehearsals.map((r) => (
                    <button key={r.id} type="button" onClick={() => setSelectedRehearsal(r.id)} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-left text-sm hover:bg-[var(--bg)]" title="Lihat detail latihan">
                      <span className="font-medium text-[var(--ink-2)]">Latihan {r.seq}</span>
                      <span className="text-right font-bold">{dayShort(r.startsAt)}, {hm(r.startsAt)}–{hm(r.endsAt)} · {r.room.name}</span>
                    </button>
                  ))}
                </div>
              )}
              {selEvent && <p className="text-xs font-semibold text-[var(--ink-2)]">{selEvent.seatsFilled} dari {selEvent.seatsTotal} kursi terisi</p>}
              {selEvent?.canAttend && <Link href={`/hadir/${detail.id}`} className="flex h-[46px] items-center justify-center rounded-xl bg-[var(--primary)] text-sm font-bold text-white hover:brightness-110">Isi kehadiran</Link>}
              {canEdit && <Link href={`/jadwal/${detail.id}`} className="flex h-[46px] items-center justify-center rounded-xl border border-[#D0D3E8] text-sm font-bold text-[var(--primary-ink)] hover:bg-[#f3f4f9]">Buka &amp; edit jadwal</Link>}
            </>
          )}
        </aside>
      </div>
    </>
  );
}

/** Detail satu sesi latihan di panel kanan: tanggal, ruangan, catatan, dan siapa saja yang wajib hadir. */
function RehearsalPanel({ detail, reh, myPersonId, canEdit, onBack }: { detail: Detail; reh: Detail["rehearsals"][number]; myPersonId: string | null; canEdit: boolean; onBack: () => void }) {
  const tone = REHEARSAL_TONE;
  const required = detail.seats.filter((s) => s.rehearsalRequired);
  const sections = detail.teams.map((t) => ({ title: t.name, seats: required.filter((s) => s.teamTypeId === t.teamTypeId) })).filter((x) => x.seats.length > 0);
  const mine = !!myPersonId && required.some((s) => s.person?.id === myPersonId);
  const filled = required.filter((s) => s.person).length;
  return (
    <>
      <div className="flex items-center gap-4">
        <div className="flex h-[76px] w-16 flex-none flex-col items-center justify-center rounded-t-[32px] rounded-b-[10px] leading-[1.1]" style={{ background: tone.bg, color: tone.fg, border: `1.5px solid ${tone.dot}` }}>
          <span className="text-[11px] font-bold uppercase tracking-[0.06em]">{WEEKDAYS[new Date(`${ymd(reh.startsAt)}T00:00:00Z`).getUTCDay()]}</span>
          <span className="text-[26px] font-extrabold">{ymd(reh.startsAt).slice(8)}</span>
          <span className="text-[11px] font-bold">{MONTHS[Number(ymd(reh.startsAt).slice(5, 7)) - 1].slice(0, 3)}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-[19px] font-extrabold leading-tight tracking-tight">Latihan {reh.seq}</h2>
          <div className="flex flex-wrap gap-1.5">
            <span className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: tone.bg, color: tone.fg }}>Latihan</span>
            {mine && <span className="whitespace-nowrap rounded-full bg-[var(--primary-soft)] px-2.5 py-[3px] text-xs font-bold text-[var(--primary-ink)]">Saya wajib hadir</span>}
          </div>
        </div>
      </div>
      <p className="-mt-2 text-xs font-semibold text-[var(--ink-2)]">{dayLong(reh.startsAt)}</p>
      <button type="button" onClick={onBack} className="-mt-3 self-start rounded-lg py-1 text-left text-xs font-bold text-[var(--primary-ink)] hover:underline">Untuk {detail.title} · {dayShort(detail.startsAt)} ›</button>
      <div className="flex gap-2.5">
        <div className="flex flex-1 flex-col gap-0.5 rounded-xl bg-[var(--bg)] px-3 py-2.5"><span className="text-[11.5px] font-semibold text-[var(--ink-2)]">Waktu</span><span className="text-sm font-bold">{hm(reh.startsAt)}–{hm(reh.endsAt)}</span></div>
        <div className="flex flex-1 flex-col gap-0.5 rounded-xl bg-[var(--bg)] px-3 py-2.5"><span className="text-[11.5px] font-semibold text-[var(--ink-2)]">Ruangan</span><span className="text-sm font-bold">{reh.room.name}</span></div>
      </div>
      {reh.note && (
        <div className="rounded-xl bg-[var(--gold-soft)] px-3.5 py-2.5 text-sm font-semibold text-[#6F4304]">{reh.note}</div>
      )}

      {sections.map((s) => (
        <div key={s.title} className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-extrabold uppercase tracking-[0.07em] text-[var(--gold-ink)]">{s.title}</span>
            <span className="h-px flex-1 bg-[#E8E4D6]" />
          </div>
          {s.seats.map((seat) => (
            <div key={seat.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-[var(--ink-2)]">{seat.label}</span>
              <span className="flex items-center gap-2 text-right font-bold">
                {seat.person && myPersonId && seat.person.id === myPersonId && <span className="whitespace-nowrap rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary-ink)]">Saya</span>}
                {seat.person ? seat.person.name : <span className="font-semibold italic text-[#B7791F]">Belum diisi</span>}
              </span>
            </div>
          ))}
        </div>
      ))}
      {required.length === 0 && <p className="text-[13px] text-[var(--ink-2)]">Belum ada kursi yang diwajibkan latihan di acara ini.</p>}
      {required.length > 0 && <p className="text-xs font-semibold text-[var(--ink-2)]">{filled} dari {required.length} kursi wajib latihan sudah terisi</p>}
      {canEdit && <Link href={`/jadwal/${detail.id}`} className="flex h-[46px] items-center justify-center rounded-xl border border-[#D0D3E8] text-sm font-bold text-[var(--primary-ink)] hover:bg-[#f3f4f9]">Buka &amp; edit jadwal</Link>}
    </>
  );
}

type MeetingInfo = {
  id: string; number: string; status: string; startsAt: string; endsAt: string; room: { name: string }; group: { id: string; name: string };
  displayTitle: string; locked: boolean; viewer: { isMember: boolean; canManage: boolean };
  participants?: { id: string; name: string; isGuest: boolean; status: string }[];
  attendance?: { invited: number; present: number; percent: number; quorumMin: number | null; quorumMet: boolean | null } | null;
  attendeesPublic?: string[] | null;
};

/** Detail rapat di panel kanan. Anggota kelompok bisa membuka rapatnya; orang lain hanya melihat waktu dan ruangan. */
function MeetingPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const [m, setM] = useState<MeetingInfo | null>(null);
  useEffect(() => {
    let live = true;
    setM(null);
    fetch(`/api/v1/meetings/${id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live) setM(d); });
    return () => { live = false; };
  }, [id]);
  if (!m) return <p className="py-10 text-center text-sm font-semibold text-[var(--ink-2)]">Memuat…</p>;
  const d = ymd(m.startsAt);
  const tone = RAPAT_TONE;
  return (
    <>
      <div className="flex items-center gap-4">
        <div className="flex h-[76px] w-16 flex-none flex-col items-center justify-center rounded-t-[32px] rounded-b-[10px] leading-[1.1]" style={{ background: tone.bg, color: tone.fg, border: `1.5px solid ${tone.dot}` }}>
          <span className="text-[11px] font-bold uppercase tracking-[0.06em]">{WEEKDAYS[new Date(`${d}T00:00:00Z`).getUTCDay()]}</span>
          <span className="text-[26px] font-extrabold">{d.slice(8)}</span>
          <span className="text-[11px] font-bold">{MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-[19px] font-extrabold leading-tight tracking-tight">{m.displayTitle}</h2>
          <span className="self-start rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: tone.bg, color: tone.fg }}>Rapat {m.group.name}</span>
        </div>
      </div>
      <div className="flex flex-col text-[13.5px]">
        {([["Tanggal", dayLong(m.startsAt)], ["Waktu", `${hm(m.startsAt)}–${hm(m.endsAt)}`], ["Ruangan", m.room.name]] as const).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-t border-[var(--line-2)] py-2.5 last:border-b"><span className="font-medium text-[var(--ink-2)]">{k}</span><span className="text-right font-bold">{v}</span></div>
        ))}
      </div>
      {m.locked && (
        <div className="flex items-start gap-3 rounded-[14px] border border-dashed border-[#c4c8dc] bg-[var(--bg)] p-3.5">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#565B76" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none"><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
          <span className="flex flex-col gap-1"><span className="text-[13.5px] font-extrabold text-[#3a3f58]">Isi rapat tertutup</span>
            <span className="text-[12.5px] font-medium leading-relaxed text-[var(--ink-2)]">Peserta, notulen, dan dokumen hanya untuk anggota {m.group.name}. Anda hanya melihat waktu dan ruangan.</span></span>
        </div>
      )}
      {m.viewer.isMember && m.participants && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-extrabold uppercase tracking-[0.07em] text-[var(--gold-ink)]">Peserta{m.participants.length ? ` (${m.participants.length})` : ""}</span>
            <span className="h-px flex-1 bg-[#E8E4D6]" />
          </div>
          {m.participants.length === 0 && <p className="text-[13px] font-medium text-[var(--ink-2)]">Belum ada peserta yang diundang.</p>}
          {m.attendance && m.participants.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-semibold text-[var(--ink-2)]">
              <span>{m.attendance.present} dari {m.attendance.invited} anggota hadir ({m.attendance.percent}%)</span>
              {m.attendance.quorumMin != null && m.attendance.quorumMet != null && (
                <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={m.attendance.quorumMet ? { background: "#E3F3E7", color: "#1B6B34" } : { background: "#FBF0D9", color: "#6F4304" }}>
                  {m.attendance.quorumMet ? `Kuorum ${m.attendance.quorumMin}% terpenuhi` : `Belum kuorum ${m.attendance.quorumMin}%`}
                </span>
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {m.participants.slice(0, 12).map((p) => {
              const c = p.status === "PRESENT" ? "#2F9E57" : p.status === "EXCUSED" ? "#B7791F" : p.status === "ABSENT" ? "#C0392B" : "#A9ADC3";
              return (
                <span key={p.id} className="whitespace-nowrap flex items-center gap-1.5 rounded-full bg-[#eceef4] px-[10px] py-[3px] text-[12px] font-bold text-[#3a3f58]" title={p.isGuest ? "Tamu" : undefined}>
                  <span className="size-[7px] rounded-full" style={{ background: c }} aria-hidden="true" />{p.name}{p.isGuest ? " (tamu)" : ""}
                </span>
              );
            })}
            {m.participants.length > 12 && <span className="whitespace-nowrap rounded-full px-2 py-[3px] text-[12px] font-bold text-[var(--ink-2)]">+{m.participants.length - 12} lainnya</span>}
          </div>
        </div>
      )}
      {!m.viewer.isMember && m.attendeesPublic && m.attendeesPublic.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-[var(--line-2)] pt-2.5 text-[13.5px]">
          <span className="font-medium text-[var(--ink-2)]">Peserta</span>
          <span className="font-bold leading-relaxed">{m.attendeesPublic.join(", ")}</span>
        </div>
      )}
      {(m.viewer.isMember || m.viewer.canManage) && (
        <Link href={`/rapat/${m.id}`} className="flex h-[46px] items-center justify-between rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-white hover:brightness-110">{m.viewer.isMember ? "Buka rapat" : "Kelola jadwal rapat"}<span aria-hidden="true">→</span></Link>
      )}
      <button type="button" onClick={onClose} className="self-center text-xs font-bold text-[var(--ink-2)] hover:underline">Tutup</button>
    </>
  );
}
