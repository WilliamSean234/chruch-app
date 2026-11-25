"use client";

import Fab from "@/components/ui/Fab";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { btnGhost, btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";
import Pager from "@/components/ui/Pager";
import { useClientPaging } from "@/components/ui/usePagedList";
import { meetingMemberTitle, meetingPublicTitle } from "@/lib/meetingLabel";
import { dayLong, dayShort, floorText } from "@/lib/ui";
import { describeFirst, expandDates, MAX_OCCURRENCES, patternText, type Pattern } from "@/lib/recurrence";

export type GroupOpt = { id: string; name: string; memberCount: number; isMember: boolean };
import OnlineFields from "@/components/online/OnlineFields";
import { emptyOnline, onlineBody, onlineProblem, type OnlineValue } from "@/lib/onlineForm";

export type RoomOpt = { id: string; name: string; floor?: number | null };
export type MeetingInit = {
  id: string; title: string; date: string; startTime: string; endTime: string; roomId: string; groupId: string; showTopic: boolean; showAttendees: boolean;
  /** Rapat yang sedang diubah: isian online dari server (null/kosong bila offline, atau bila yang membuka bukan anggota kelompok). */
  online?: OnlineValue; wasOnline?: boolean;
};
type UsageItem = { eventId: string; startsAt: string; endsAt: string; status: string };
type UsageRoom = { id: string; items: UsageItem[] };
type Link = { title: string; url: string };

const eyebrow = "text-xs font-extrabold tracking-[0.07em] text-[var(--gold-ink)]";
const card = "flex flex-col gap-[18px] rounded-[20px] border border-[var(--line)] bg-white p-6";
const dotTime = (hhmm: string) => hhmm.replace(":", ".");
const hhmmOf = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

function Rule({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2.5"><span className={eyebrow}>{children}</span><span className="h-px flex-1 bg-[#e8e4d6]" /></div>;
}

function Choice({ on, disabled, onClick, title, hint }: { on: boolean; disabled?: boolean; onClick: () => void; title: string; hint?: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} disabled={disabled} onClick={onClick}
      className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left ${on ? "border-[1.5px] border-[var(--primary)] bg-[#f1f2fd]" : "border-[var(--line)] bg-white hover:bg-[#f6f7fe]"} disabled:cursor-not-allowed disabled:opacity-55`}>
      <span className={`size-[18px] flex-none rounded-full bg-white ${on ? "border-[5px] border-[var(--primary)]" : "border-[1.5px] border-[#b8bcd3]"}`} aria-hidden="true" />
      <span className="flex min-w-0 flex-col gap-0.5"><span className="text-sm font-bold">{title}</span>{hint && <span className="text-[12.5px] font-medium text-[var(--ink-2)]">{hint}</span>}</span>
    </button>
  );
}

function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex flex-col gap-0.5"><span className="text-sm font-bold">{label}</span><span className="text-[12.5px] font-medium text-[var(--ink-2)]">{hint}</span></span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
        className={`flex h-[30px] w-[52px] flex-none items-center rounded-full p-[3px] transition-colors ${on ? "justify-end bg-[var(--primary)]" : "justify-start bg-[#b8bcd3]"}`}>
        <span className="size-6 rounded-full bg-white shadow-[0_1px_3px_rgba(23,26,44,0.3)]" />
      </button>
    </div>
  );
}

/** Buat rapat baru, atau ubah rapat yang ada (mode edit: tanpa lampiran, itu diatur di halaman rapat). */
export default function MeetingForm({ groups, rooms, meeting }: { groups: GroupOpt[]; rooms: RoomOpt[]; meeting?: MeetingInit }) {
  const router = useRouter();
  const edit = !!meeting;
  const [groupId, setGroupId] = useState(meeting?.groupId ?? (groups.length === 1 ? groups[0].id : ""));
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [date, setDate] = useState(meeting?.date ?? todayIso());
  const [startTime, setStartTime] = useState(meeting?.startTime ?? "19:00");
  const [endTime, setEndTime] = useState(meeting?.endTime ?? "21:00");
  const [roomId, setRoomId] = useState(meeting?.wasOnline ? "" : meeting?.roomId ?? "");
  const [onl, setOnl] = useState<OnlineValue>(meeting?.online ?? emptyOnline);
  const [showTopic, setShowTopic] = useState(meeting?.showTopic ?? false);
  const [showAttendees, setShowAttendees] = useState(meeting?.showAttendees ?? false);
  const [links, setLinks] = useState<Link[]>([{ title: "", url: "" }]);
  const [usage, setUsage] = useState<UsageRoom[]>([]);
  const [members, setMembers] = useState<{ personId: string; name: string }[] | null>(null);
  const [inviteMode, setInviteMode] = useState<"ALL" | "SELECT">("ALL");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [memberQ, setMemberQ] = useState("");
  const [guests, setGuests] = useState<string[]>([]);
  const [guestInput, setGuestInput] = useState("");
  const [clash, setClash] = useState<{ count: number; names: string[] | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ id: string; created: boolean; series?: { created: number; skipped: { date: string; reason: string }[] } } | null>(null);
  const [repeat, setRepeat] = useState<"NONE" | Pattern>("NONE");
  const [endMode, setEndMode] = useState<"COUNT" | "UNTIL">("COUNT");
  const [repCount, setRepCount] = useState(8);
  const [repUntil, setRepUntil] = useState("");
  const [roomFree, setRoomFree] = useState<Map<string, boolean> | null>(null);

  const group = groups.find((g) => g.id === groupId) ?? null;
  // tautan, tema, dan pembicara adalah isi rapat: hanya anggota kelompok yang boleh mengisinya
  const canOnline = !!group?.isMember;
  const isOnline = canOnline && onl.online;
  const timeOk = !!startTime && !!endTime && toMin(endTime) > toMin(startTime);

  // pemakaian ruangan pada tanggal terpilih
  useEffect(() => {
    if (!date) return;
    let live = true;
    void callApi("GET", `/api/v1/rooms/usage?date=${date}`).then((r) => { if (live && r.ok) setUsage(r.data.rooms); });
    return () => { live = false; };
  }, [date]);

  // nama anggota (hanya bila pengguna anggota kelompok itu); ganti kelompok = pilihan undangan diulang dari awal
  useEffect(() => {
    setMembers(null); setInviteMode("ALL"); setPicked(new Set()); setMemberQ(""); setGuests([]); setGuestInput("");
    if (!group?.isMember || edit) return;
    let live = true;
    void callApi("GET", `/api/v1/groups/${group.id}`).then((r) => {
      if (live && r.ok) setMembers((r.data.members as { personId: string; name: string; title: string | null }[]).map((m) => ({ personId: m.personId, name: m.title ? `${m.title} ${m.name}` : m.name })));
    });
    return () => { live = false; };
  }, [group?.id, group?.isMember, edit]);

  const shownMembers = useMemo(() => {
    const q = memberQ.trim().toLowerCase();
    return (members ?? []).filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [members, memberQ]);
  const memberPaging = useClientPaging(shownMembers);
  const toggleMember = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addGuest = () => {
    const g = guestInput.trim();
    if (!g) return;
    if (!guests.some((x) => x.toLowerCase() === g.toLowerCase())) setGuests([...guests, g]);
    setGuestInput("");
  };

  // peringatan jadwal ganda anggota
  useEffect(() => {
    setClash(null);
    if (!groupId || !date || !timeOk) return;
    if (inviteMode === "SELECT" && picked.size === 0) return;
    let live = true;
    const t = setTimeout(async () => {
      const q = new URLSearchParams({ groupId, date, startTime, endTime });
      if (meeting) q.set("excludeEventId", meeting.id);
      if (inviteMode === "SELECT") q.set("personIds", [...picked].join(","));
      const r = await callApi("GET", `/api/v1/meetings/clashes?${q}`);
      if (live && r.ok) setClash(r.data);
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [groupId, date, startTime, endTime, timeOk, meeting, inviteMode, picked]);

  const roomState = useMemo(() => {
    const out = new Map<string, string | null>(); // roomId → label terpakai, atau null bila kosong
    for (const r of rooms) {
      const used = (usage.find((u) => u.id === r.id)?.items ?? [])
        .filter((it) => it.status !== "CANCELLED" && it.eventId !== meeting?.id)
        .filter((it) => timeOk && toMin(hhmmOf(it.startsAt)) < toMin(endTime) && toMin(hhmmOf(it.endsAt)) > toMin(startTime))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      out.set(r.id, used.length ? `Terpakai ${dotTime(hhmmOf(used[0].startsAt))}–${dotTime(hhmmOf(used[0].endsAt))}` : null);
    }
    return out;
  }, [rooms, usage, meeting?.id, timeOk, startTime, endTime]);

  // ruangan terpilih yang ternyata bentrok setelah jam diubah dilepas supaya tidak tersimpan salah
  useEffect(() => { if (roomId && roomState.get(roomId)) setRoomId(""); }, [roomState, roomId]);

  // pengulangan: tanggal dihitung langsung di browser; status ruangan per tanggal ditanyakan ke server
  const repeating = !edit && repeat !== "NONE";
  const endOk = endMode === "COUNT" ? repCount >= 2 && repCount <= MAX_OCCURRENCES : !!repUntil && repUntil >= date;
  const series = useMemo(() => {
    if (!repeating || !date || !endOk) return null;
    return expandDates(date, repeat as Pattern, endMode === "COUNT" ? { count: repCount } : { until: repUntil });
  }, [repeating, date, endOk, repeat, endMode, repCount, repUntil]);
  const first = describeFirst(date || todayIso());
  useEffect(() => {
    setRoomFree(null);
    if (!repeating || !series || series.dates.length < 2 || !groupId || (!roomId && !isOnline) || !timeOk) return;
    let live = true;
    const t = setTimeout(async () => {
      const r = await callApi("POST", "/api/v1/meetings/series/preview", {
        groupId, date, startTime, endTime, ...(isOnline ? { online: true } : { roomId }), repeat: { pattern: repeat, ...(endMode === "COUNT" ? { count: repCount } : { until: repUntil }) },
      });
      if (live && r.ok) setRoomFree(new Map((r.data.dates as { date: string; free: boolean }[]).map((d) => [d.date, d.free])));
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [repeating, series, groupId, roomId, isOnline, timeOk, date, startTime, endTime, repeat, endMode, repCount, repUntil]);
  const skippedCount = series && roomFree ? series.dates.filter((d) => roomFree.get(d) === false).length : 0;

  const roomName = isOnline ? "Online" : rooms.find((r) => r.id === roomId)?.name ?? "Belum dipilih";
  const chipPublic = group ? meetingPublicTitle(group.name, title || "…", showTopic) : "Rapat";
  const chipMember = group ? meetingMemberTitle(group.name, title || "…") : "Rapat";
  const canAttach = !edit && !!group?.isMember;

  async function save() {
    if (!groupId) return setError("Pilih kelompok.");
    if (!title.trim()) return setError("Isi judul atau topik rapat.");
    if (!date) return setError("Pilih tanggal.");
    if (!timeOk) return setError("Jam selesai harus setelah jam mulai.");
    if (!isOnline && !roomId && !(edit && meeting?.wasOnline && !canOnline)) return setError("Pilih ruangan yang tersedia.");
    const onlineProb = canOnline ? onlineProblem(onl, "RAPAT") : null;
    if (onlineProb) return setError(onlineProb);
    if (repeating && !endOk) return setError(endMode === "COUNT" ? `Isi jumlah rapat antara 2 dan ${MAX_OCCURRENCES}.` : "Pilih tanggal berhenti yang sama dengan atau setelah tanggal rapat pertama.");
    if (repeating && (!series || series.dates.length < 2)) return setError("Pengulangan ini hanya menghasilkan satu tanggal. Perpanjang tanggal berhenti.");
    if (!edit && inviteMode === "SELECT" && picked.size === 0) return setError("Pilih minimal satu anggota yang diundang, atau undang seluruh anggota.");
    const cleanLinks = links.map((l) => ({ title: l.title.trim(), url: l.url.trim() })).filter((l) => l.title || l.url);
    if (canAttach && cleanLinks.some((l) => !l.title || !l.url)) return setError("Lengkapi judul dan alamat tautan, atau kosongkan barisnya.");
    setBusy(true); setError("");
    const r = edit
      ? await callApi("PATCH", `/api/v1/meetings/${meeting!.id}`, { title: title.trim(), date, startTime, endTime, ...(isOnline || (meeting?.wasOnline && !canOnline) ? {} : { roomId }), ...(canOnline ? onlineBody(onl, "RAPAT") : {}), showTopic, showAttendees })
      : await callApi("POST", "/api/v1/meetings", {
        groupId, title: title.trim(), date, startTime, endTime, ...(isOnline ? {} : { roomId }), ...(canOnline ? onlineBody(onl, "RAPAT") : {}), showTopic, showAttendees, links: canAttach ? cleanLinks : [],
        invite: { mode: inviteMode, personIds: inviteMode === "SELECT" ? [...picked] : [], guests: group?.isMember ? guests : [] },
        repeat: repeating ? { pattern: repeat, ...(endMode === "COUNT" ? { count: repCount } : { until: repUntil }) } : undefined,
      });
    setBusy(false);
    if (r.ok) { setDone({ id: r.data.id, created: !edit, series: r.data.seriesResult }); router.refresh(); } else setError(errMsg(r.data));
  }

  const saveLabel = busy ? "Menyimpan…" : edit ? "Simpan perubahan" : repeating ? "Simpan rapat berulang" : "Simpan rapat";

  if (groups.length === 0) {
    return <div className={`${card} text-sm font-semibold text-[var(--ink-2)]`}>Anda belum punya hak menjadwalkan rapat. Minta Superadmin memberi jabatan Penjadwal di kelompok Anda.</div>;
  }

  return (
    <div className="flex flex-wrap items-start gap-5">
      <Fab quick="save" actions={[
        { key: "save", label: saveLabel, icon: "save", disabled: busy || !!done, busy, onClick: () => { void save(); } },
        { key: "cancel", label: "Batal", icon: "cancel", tone: "neutral", onClick: () => router.back() },
      ]} />
      <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[13px] font-semibold text-[var(--ink-2)]">{edit ? "Ubah isi lalu simpan. Perubahan baru berlaku setelah Anda menekan Simpan perubahan." : "Isi data rapat lalu simpan."}</span>
          <span className="flex flex-wrap items-center gap-3 max-md:hidden">
            <button type="button" onClick={() => router.back()} className={`${btnGhost} !h-[46px] !px-[22px]`}>Batal</button>
            <button type="button" onClick={save} disabled={busy || !!done} className={`${btnPrimary} !h-[46px] !px-[26px]`}>{saveLabel}</button>
          </span>
        </div>
        {error && <p role="alert" className="rounded-xl border border-[#f0c7c7] bg-[#fdf1f1] px-4 py-3 text-sm font-semibold text-[#9b1c1c]">{error}</p>}
        <div className={card}>
          <Rule>INFORMASI RAPAT</Rule>
          <div className="flex flex-wrap gap-4">
            <label className="flex min-w-[220px] flex-[1_1_220px] flex-col gap-1.5 text-[13px] font-bold">Kelompok
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={edit} className={inputCls}>
                <option value="">Pilih kelompok…</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              {group && <span className="text-xs font-medium text-[var(--ink-2)]">{group.isMember ? "Anda anggota kelompok ini." : "Dibuat atas nama kelompok. Isi rapat tetap tidak terbaca oleh Anda."}</span>}
            </label>
            <label className="flex min-w-[300px] max-md:min-w-0 flex-[2_1_300px] flex-col gap-1.5 text-[13px] font-bold">Judul atau topik rapat
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Mis. Evaluasi pelayanan Oktober" className={inputCls} />
            </label>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex min-w-[220px] flex-[2_1_220px] flex-col gap-1.5 text-[13px] font-bold">Tanggal
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </label>
            <label className="flex min-w-[110px] flex-[1_1_110px] flex-col gap-1.5 text-[13px] font-bold">Mulai
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
            </label>
            <label className="flex min-w-[110px] flex-[1_1_110px] flex-col gap-1.5 text-[13px] font-bold">Selesai
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
            </label>
          </div>
          {!timeOk && startTime && endTime && <p className="-mt-2 text-xs font-semibold text-[#9b1c1c]">Jam selesai harus setelah jam mulai.</p>}

          {canOnline && <OnlineFields kind="RAPAT" value={onl} onChange={setOnl} />}
          {!isOnline && !(edit && meeting?.wasOnline && !canOnline) && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold">Pinjam ruangan</span>
            <div role="radiogroup" aria-label="Ruangan" className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2.5">
              {rooms.map((r) => {
                const busyLabel = roomState.get(r.id);
                const on = r.id === roomId;
                return (
                  <button key={r.id} type="button" role="radio" aria-checked={on} aria-disabled={!!busyLabel} disabled={!!busyLabel || !timeOk} onClick={() => setRoomId(r.id)}
                    className={`flex flex-col items-start gap-1 rounded-xl border px-3.5 py-3 text-left ${on ? "border-[1.5px] border-[var(--primary)] bg-[#f1f2fd]" : busyLabel ? "border-[var(--line)] bg-[var(--bg)] opacity-75" : "border-[var(--line)] bg-white hover:bg-[#f6f7fe]"}`}>
                    <span className="text-sm font-extrabold">{r.name}{r.floor != null && <span className="ml-1.5 text-xs font-semibold text-[var(--ink-2)]">{floorText(r.floor)}</span>}</span>
                    <span className={`text-[12.5px] font-semibold ${busyLabel ? "text-[#9b1c1c]" : on ? "text-[var(--primary-ink)]" : "text-[#1b6b34]"}`}>{busyLabel ?? "Tersedia"}</span>
                  </button>
                );
              })}
            </div>
            <span className="text-[12.5px] font-medium leading-relaxed text-[var(--ink-2)]">Anda hanya melihat jam yang sudah terpakai, bukan acara apa yang memakainya. Ruangan yang bentrok tidak bisa dipilih.</span>
          </div>
          )}
        </div>

        {!edit && (
          <div className={card}>
            <Rule>ULANGI RAPAT</Rule>
            <p className="m-0 -mt-1 text-[13px] font-medium leading-relaxed text-[var(--ink-2)]">Untuk rapat rutin. Aplikasi membuat satu rapat per tanggal, jadi tiap rapat tetap bisa diubah atau dibatalkan sendiri-sendiri.</p>
            <div role="radiogroup" aria-label="Pengulangan" className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5">
              <Choice on={repeat === "NONE"} onClick={() => setRepeat("NONE")} title="Tidak berulang" hint="Rapat sekali ini saja" />
              <Choice on={repeat === "WEEKLY"} onClick={() => setRepeat("WEEKLY")} title="Tiap minggu" hint={patternText("WEEKLY", first.weekday, null)} />
              <Choice on={repeat === "BIWEEKLY"} onClick={() => setRepeat("BIWEEKLY")} title="Tiap 2 minggu" hint={patternText("BIWEEKLY", first.weekday, null)} />
              <Choice on={repeat === "MONTHLY_NTH"} onClick={() => setRepeat("MONTHLY_NTH")} title="Tiap bulan" hint={patternText("MONTHLY_NTH", first.weekday, first.ordinal)} />
            </div>

            {repeating && (
              <>
                <div className="flex flex-wrap items-end gap-4">
                  <div role="radiogroup" aria-label="Berhenti" className="flex min-w-[260px] flex-[1_1_260px] flex-col gap-2.5">
                    <Choice on={endMode === "COUNT"} onClick={() => setEndMode("COUNT")} title="Berhenti setelah sekian rapat" />
                    <Choice on={endMode === "UNTIL"} onClick={() => setEndMode("UNTIL")} title="Berhenti pada tanggal tertentu" />
                  </div>
                  {endMode === "COUNT" ? (
                    <label className="flex min-w-[200px] flex-[1_1_200px] flex-col gap-1.5 text-[13px] font-bold">Jumlah rapat (termasuk yang pertama)
                      <input type="number" min={2} max={MAX_OCCURRENCES} value={repCount} onChange={(e) => setRepCount(Number(e.target.value))} className={inputCls} />
                      <span className="text-xs font-medium text-[var(--ink-2)]">Paling banyak {MAX_OCCURRENCES} rapat sekali buat.</span>
                    </label>
                  ) : (
                    <label className="flex min-w-[200px] flex-[1_1_200px] flex-col gap-1.5 text-[13px] font-bold">Berhenti pada tanggal
                      <input type="date" min={date} value={repUntil} onChange={(e) => setRepUntil(e.target.value)} className={inputCls} />
                    </label>
                  )}
                </div>

                {series && (
                  <div className="flex flex-col gap-2.5">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-extrabold">
                      {series.dates.length - skippedCount} rapat akan dibuat
                      {skippedCount > 0 && <span className="rounded-full bg-[#FBE4E4] px-2.5 py-[3px] text-xs font-extrabold text-[#9B1C1C]">{skippedCount} tanggal dilewati: ruangan terpakai</span>}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {series.dates.map((d) => {
                        const bad = roomFree?.get(d) === false;
                        return (
                          <span key={d} className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-[12.5px] font-bold ${bad ? "bg-[#FBE4E4] text-[#9B1C1C] line-through" : "bg-[#EEF0FD] text-[#2A2F8F]"}`}
                            title={bad ? "Ruangan sudah terpakai pada tanggal ini, rapat tidak dibuat" : undefined}>{dayShort(`${d}T12:00:00+07:00`)}</span>
                        );
                      })}
                    </div>
                    {series.capped && <span className="text-xs font-semibold text-[#6f4304]">Dibatasi {MAX_OCCURRENCES} rapat. Buat seri berikutnya setelah rapat terakhir ini.</span>}
                    {!roomId && <span className="text-xs font-medium text-[var(--ink-2)]">Pilih ruangan di atas untuk melihat tanggal mana yang ruangannya sudah terpakai.</span>}
                  </div>
                )}
                {!series && <span className="text-xs font-semibold text-[#9b1c1c]">{endMode === "COUNT" ? `Isi jumlah rapat antara 2 dan ${MAX_OCCURRENCES}.` : "Pilih tanggal berhenti yang sama dengan atau setelah tanggal rapat pertama."}</span>}
                <div className="rounded-[14px] border border-dashed border-[#c4c8dc] bg-[var(--bg)] px-4 py-3 text-[12.5px] font-medium leading-relaxed text-[var(--ink-2)]">
                  Undangan berlaku untuk semua rapat dalam seri. Tautan lampiran hanya dipasang di rapat pertama; tambahkan sisanya di halaman tiap rapat.
                </div>
              </>
            )}
          </div>
        )}

        <div className={card}>
          <Rule>UNDANGAN</Rule>
          {edit ? (
            <div className="rounded-xl bg-[#f1f2fd] px-3.5 py-3 text-[13px] font-semibold leading-relaxed text-[var(--primary-ink)]">
              Undangan dan kehadiran diatur di halaman rapat, pada kartu “Undangan &amp; kehadiran”, supaya catatan kehadiran tidak ikut berubah saat jadwal digeser.
            </div>
          ) : (
            <>
              <div role="radiogroup" aria-label="Siapa yang diundang" className="flex flex-col gap-2.5">
                <Choice on={inviteMode === "ALL"} onClick={() => setInviteMode("ALL")}
                  title={group ? `Seluruh anggota ${group.name} (${group.memberCount} orang)` : "Seluruh anggota kelompok yang dipilih"} />
                <Choice on={inviteMode === "SELECT"} disabled={!group?.isMember} onClick={() => setInviteMode("SELECT")} title="Pilih anggota tertentu"
                  hint={group && !group.isMember ? "Hanya anggota kelompok yang bisa memilih nama. Seluruh anggota tetap diundang otomatis." : undefined} />
              </div>

              {inviteMode === "SELECT" && group?.isMember && (
                <div className="flex flex-col gap-2.5 overflow-hidden rounded-xl border border-[var(--line)] pt-3.5">
                  <div className="flex flex-wrap items-center gap-2.5 px-3.5">
                    <input aria-label="Cari anggota" placeholder="Cari anggota…" value={memberQ} onChange={(e) => setMemberQ(e.target.value)} className={`${inputCls} !h-10 min-w-[160px] flex-1`} />
                    <button type="button" onClick={() => setPicked((prev) => new Set([...prev, ...shownMembers.map((m) => m.personId)]))}
                      className="h-9 rounded-full border-[1.5px] border-dashed border-[#9aa0d6] bg-[#f6f7fe] px-3.5 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[#eceefd]">{memberQ.trim() ? "Pilih hasil pencarian" : "Pilih semua"}</button>
                    <button type="button" onClick={() => setPicked(new Set())} className="h-9 rounded-full px-3 text-[13px] font-bold text-[var(--ink-2)] hover:bg-[var(--bg)]">Kosongkan</button>
                    <span className="text-xs font-bold text-[var(--ink-2)]">{picked.size} dari {members?.length ?? 0} dipilih</span>
                  </div>
                  {members === null && <p className="px-3.5 pb-3 text-sm font-medium text-[var(--ink-2)]">Memuat anggota…</p>}
                  {members && shownMembers.length === 0 && <p className="px-3.5 pb-3 text-sm font-medium text-[var(--ink-2)]">Tidak ada anggota yang cocok.</p>}
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2 px-3.5">
                    {memberPaging.slice.map((m) => {
                      const on = picked.has(m.personId);
                      return (
                        <label key={m.personId} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[13.5px] font-semibold ${on ? "border-[var(--primary)] bg-[#f1f2fd]" : "border-[var(--line)] hover:bg-[#f6f7fe]"}`}>
                          <input type="checkbox" checked={on} onChange={() => toggleMember(m.personId)} className="size-4 accent-[var(--primary)]" />
                          <span className="min-w-0 truncate">{m.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <Pager page={memberPaging.page} pageSize={memberPaging.pageSize} total={memberPaging.total} onPage={memberPaging.setPage} onPageSize={memberPaging.setPageSize} noun="anggota" className="!border-t-0 !pt-1" />
                </div>
              )}

              {group?.isMember && (
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-bold">Tamu <span className="font-medium text-[var(--ink-2)]">(tidak wajib, tidak dihitung untuk kuorum)</span></span>
                  <div className="flex flex-wrap gap-2">
                    <input aria-label="Nama tamu" placeholder="Nama tamu, mis. Bpk. Daniel (narasumber)" value={guestInput} maxLength={80}
                      onChange={(e) => setGuestInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGuest(); } }}
                      className={`${inputCls} min-w-[220px] flex-1`} />
                    <button type="button" onClick={addGuest} disabled={!guestInput.trim()} className="h-11 rounded-xl border border-[#d0d3e8] bg-white px-4 text-sm font-bold text-[var(--primary-ink)] hover:bg-[#f3f4f9] disabled:opacity-50">+ Tamu</button>
                  </div>
                  {guests.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {guests.map((g) => (
                        <span key={g} className="flex items-center gap-1.5 rounded-full bg-[#fbf0d9] py-[3px] pl-[11px] pr-1.5 text-[12.5px] font-bold text-[#6f4304]">
                          {g}<button type="button" onClick={() => setGuests(guests.filter((x) => x !== g))} aria-label={`Hapus tamu ${g}`} className="grid size-5 place-items-center rounded-full hover:bg-white/70">✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {group && !group.isMember && <span className="text-[13px] font-semibold leading-relaxed text-[var(--ink-2)]">Seluruh anggota diundang otomatis. Daftar nama hanya terlihat oleh anggota kelompok, jadi tidak ditampilkan kepada Anda.</span>}
            </>
          )}
          {clash && clash.count > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-[#ead9ae] bg-[#fffbf0] px-3.5 py-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6F4304" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none"><path d="M12 3l10 18H2L12 3z" /><path d="M12 10v5M12 18h.01" /></svg>
              <span className="text-[13px] font-semibold leading-relaxed text-[#6f4304]">
                {clash.names ? `${clash.names.join(", ")} punya jadwal lain pada jam ini.` : `${clash.count} anggota punya jadwal lain pada jam ini (nama tidak ditampilkan).`} Ini hanya peringatan, rapat tetap bisa disimpan.
              </span>
            </div>
          )}
          {clash && clash.count === 0 && <span className="text-[12.5px] font-semibold text-[#1b6b34]">Tidak ada anggota yang punya jadwal lain pada jam ini.</span>}
        </div>

        <div className={card}>
          <Rule>TAMPILAN DI KALENDER</Rule>
          <Switch on={showTopic} onChange={setShowTopic} label="Tampilkan topik di kalender" hint={`Bawaan: mati. Orang di luar kelompok hanya melihat “Rapat ${group?.name ?? "…"}”.`} />
          <Switch on={showAttendees} onChange={setShowAttendees} label="Tampilkan peserta di kalender" hint="Bawaan: mati. Daftar nama anggota tidak ikut terlihat." />
          <span className="rounded-[10px] bg-[#f1f2fd] px-3.5 py-2.5 text-[12.5px] font-semibold leading-relaxed text-[var(--primary-ink)]">Notulen dan tautan dokumen tetap tertutup apa pun pilihan di atas.</span>
        </div>

        {canAttach && (
          <div className={card}>
            <Rule>LAMPIRAN (TAUTAN, TIDAK WAJIB)</Rule>
            {links.map((l, i) => (
              <div key={i} className="flex flex-wrap gap-3">
                <input aria-label="Judul tautan" placeholder="Judul, mis. Bahan evaluasi" value={l.title} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className={`${inputCls} min-w-[200px] flex-[1_1_200px]`} />
                <input aria-label="Alamat tautan" placeholder="https://drive.google.com/…" value={l.url} onChange={(e) => setLinks(links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} className={`${inputCls} min-w-[280px] max-md:min-w-0 flex-[2_1_280px]`} />
                {links.length > 1 && <button type="button" onClick={() => setLinks(links.filter((_, j) => j !== i))} aria-label="Hapus baris tautan" className="h-11 rounded-xl px-3 text-sm font-bold text-[var(--ink-2)] hover:bg-[var(--bg)]">✕</button>}
              </div>
            ))}
            <div><button type="button" onClick={() => setLinks([...links, { title: "", url: "" }])} className="h-9 rounded-full border-[1.5px] border-dashed border-[#9aa0d6] bg-[#f6f7fe] px-3.5 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[#eceefd]">+ tautan lain</button></div>
          </div>
        )}
        {!edit && group && !group.isMember && (
          <div className="rounded-[14px] border border-dashed border-[#c4c8dc] bg-[var(--bg)] px-4 py-3 text-[13px] font-medium leading-relaxed text-[var(--ink-2)]">Tautan lampiran hanya bisa ditambahkan oleh anggota kelompok, di halaman rapat setelah rapat dibuat.</div>
        )}

        {error && <p role="alert" className="rounded-xl border border-[#f0c7c7] bg-[#fdf1f1] px-4 py-3 text-sm font-semibold text-[#9b1c1c]">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={() => router.back()} className={`${btnGhost} !h-[46px] !px-[22px]`}>Batal</button>
          <button type="button" onClick={save} disabled={busy || !!done} className={`${btnPrimary} !h-[46px] !px-[26px]`}>{saveLabel}</button>
        </div>
      </section>

      <aside className="flex min-w-[300px] max-md:min-w-0 max-w-[400px] flex-[1_1_320px] flex-col gap-5">
        <div className="flex flex-col gap-4 rounded-[20px] border border-[var(--line)] bg-white p-[22px]">
          <div className="flex flex-col gap-1"><span className={eyebrow}>DILIHAT ORANG DI LUAR KELOMPOK</span><span className="text-[12.5px] font-medium text-[var(--ink-2)]">Begini rapat ini muncul di kalender mereka.</span></div>
          <div className="flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[#f8e6dd] px-2.5 py-1 text-[12.5px] font-bold leading-tight text-[#7a3a1e]">
            <span className="size-[7px] flex-none rounded-full bg-[#c0562d]" aria-hidden="true" /><span className="min-w-0">{dotTime(startTime)} {chipPublic}</span>
          </div>
          <div className="flex flex-col text-[13.5px]">
            {([["Waktu", `${dotTime(startTime)}–${dotTime(endTime)}`], ["Ruangan", roomName], ["Kelompok", group?.name ?? "—"]] as const).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-t border-[var(--line-2)] py-2.5"><span className="font-medium text-[var(--ink-2)]">{k}</span><span className="text-right font-bold">{v}</span></div>
            ))}
            {showTopic && <div className="flex justify-between gap-3 border-t border-[var(--line-2)] py-2.5"><span className="font-medium text-[var(--ink-2)]">Topik</span><span className="text-right font-bold">{title || "…"}</span></div>}
            {showAttendees && <div className="flex justify-between gap-3 border-t border-[var(--line-2)] py-2.5"><span className="font-medium text-[var(--ink-2)]">Peserta</span><span className="text-right font-bold">{group ? (edit || inviteMode === "ALL" ? `Seluruh anggota ${group.name} (${group.memberCount} orang)` : `${picked.size} anggota ${group.name}`) : "…"}</span></div>}
            <div className="flex justify-between gap-3 border-y border-[var(--line-2)] py-2.5"><span className="font-medium text-[var(--ink-2)]">Notulen dan dokumen</span>
              <span className="flex items-center gap-1.5 font-bold text-[var(--ink-2)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>Tertutup</span></div>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-[20px] border border-[var(--line)] bg-white p-[22px]">
          <span className={eyebrow}>DILIHAT ANGGOTA {(group?.name ?? "KELOMPOK").toUpperCase()}</span>
          <div className="flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[#f8e6dd] px-2.5 py-1 text-[12.5px] font-bold leading-tight text-[#7a3a1e]">
            <span className="size-[7px] flex-none rounded-full bg-[#c0562d]" aria-hidden="true" /><span className="min-w-0">{dotTime(startTime)} {chipMember}</span>
          </div>
          <span className="text-[13px] font-medium leading-relaxed text-[var(--ink-2)]">Lengkap dengan peserta, kehadiran, notulen, dan tautan lampiran.</span>
        </div>
      </aside>
      {done && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[#171a2c]/45 p-4 backdrop-blur-[2px]">
          <div role="alertdialog" aria-modal="true" aria-labelledby="saved-title"
            className="flex w-full max-w-[420px] flex-col gap-5 rounded-[22px] border border-[var(--line)] bg-white p-6 shadow-[0_24px_60px_-20px_rgba(30,34,90,0.5)]">
            <div className="flex items-start gap-4">
              <span className="grid size-11 flex-none place-items-center rounded-full bg-[#E3F3E7] text-[#1B6B34]" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
              <div className="flex min-w-0 flex-col gap-1.5">
                <h2 id="saved-title" className="m-0 text-[17px] font-extrabold leading-snug">{done.series ? `${done.series.created} rapat berhasil dibuat` : done.created ? "Rapat berhasil dibuat" : "Perubahan berhasil disimpan"}</h2>
                {done.series && done.series.skipped.length > 0 && (
                  <p className="m-0 rounded-lg bg-[#FDF1F1] px-3 py-2 text-[13px] font-semibold leading-relaxed text-[#9B1C1C]">
                    Dilewati karena ruangan sudah terpakai: {done.series.skipped.map((x) => dayShort(`${x.date}T12:00:00+07:00`)).join(", ")}.
                  </p>
                )}
                <p className="m-0 text-sm font-medium leading-relaxed text-[var(--ink-2)]">{title.trim()} · {dayLong(`${date}T${startTime}:00+07:00`)} · {startTime}–{endTime}{roomName !== "Belum dipilih" ? ` · ${roomName}` : ""}</p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2.5">
              <button type="button" autoFocus onClick={() => router.push("/")} className="h-11 rounded-xl border border-[var(--line)] bg-white px-5 text-sm font-bold hover:bg-[var(--bg)]">Ke kalender</button>
              {done.series && <button type="button" onClick={() => router.push("/rapat")} className="h-11 rounded-xl border border-[var(--line)] bg-white px-5 text-sm font-bold hover:bg-[var(--bg)]">Daftar rapat</button>}
              <button type="button" onClick={() => router.push(`/rapat/${done.id}`)} className="h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:brightness-110">{done.series ? "Buka rapat pertama" : "Kembali ke rapat"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
