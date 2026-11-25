"use client";

import OnlineFields from "@/components/online/OnlineFields";
import { emptyOnline, onlineProblem, type OnlineValue } from "@/lib/onlineForm";
import Fab from "@/components/ui/Fab";
import Link from "next/link";
import { askConfirm } from "@/components/ui/Confirm";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { btnPrimary, callApi, errMsg } from "@/components/jadwal/api";
import { eachDate, matchesPattern } from "@/lib/time";

type Opt = { id: string; name: string };
type TeamMin = { id: string; name: string; rehearsalRequiredDefault: boolean };
type Team = { id: string; name: string; ministries: TeamMin[] };
type Slot = { ministryId: string; ministryName: string; teamTypeId: string; teamName: string; count: number; rehearsalRequired: boolean };
type Tpl = {
  id: string; name: string; weekday: number; recurrence: "WEEKLY" | "MONTHLY_NTH"; ordinal: number | null; startTime: string; durationMin: number;
  room: Opt; isOnline?: boolean; online?: { url: string | null; communityIds: string[]; reminder: boolean } | null; attendanceModeDefault: "COUNT" | "NAMES"; attendanceCommunity: Opt | null; slots: Slot[];
};
type Room = Opt & { isActive: boolean; floor?: number | null };
type SlotState = Record<string, { count: number; rehearsal: boolean }>;

const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const WD3 = ["MIN", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];
const MON3 = ["JAN", "FEB", "MAR", "APR", "MEI", "JUN", "JUL", "AGU", "SEP", "OKT", "NOV", "DES"];
// Warna tiap template (dipakai bergilir): latar, teks, dan garis saat dipilih.
const PAL = [
  { bg: "#E8E9FA", fg: "#2A2F8F", border: "#3037A8" },
  { bg: "#F4E6F5", fg: "#76237F", border: "#8E2E99" },
  { bg: "#FBEFD6", fg: "#6F4304", border: "#B7791F" },
  { bg: "#E4F3EC", fg: "#14603E", border: "#1E8A5A" },
];

const dot = (hhmm: string) => hhmm.replace(":", ".");
const ordText = (n: number | null) => (n === 5 ? "terakhir" : `ke-${n}`);
const endTime = (start: string, minutes: number) => {
  const [h, m] = start.split(":").map(Number);
  const t = (h * 60 + m + minutes) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const patKey = (t: { recurrence: string; weekday: number; ordinal: number | null }) => (t.recurrence === "MONTHLY_NTH" ? `M:${t.weekday}:${t.ordinal}` : `W:${t.weekday}`);
const parsePat = (v: string) => {
  const [k, w, o] = v.split(":");
  return k === "M" ? { recurrence: "MONTHLY_NTH" as const, weekday: Number(w), ordinal: Number(o) } : { recurrence: "WEEKLY" as const, weekday: Number(w), ordinal: null };
};
const subText = (t: { recurrence: string; weekday: number; ordinal: number | null; startTime: string; durationMin: number; room: string }) =>
  `${DAYS[t.weekday]}${t.recurrence === "MONTHLY_NTH" ? ` ${ordText(t.ordinal)}` : ""} · ${dot(t.startTime)}–${dot(endTime(t.startTime, t.durationMin))} · ${t.room}`;

const fld = "h-[46px] w-full rounded-xl border border-[#D9DCEA] bg-white px-3.5 text-[14.5px] font-semibold text-[#171A2C]";
const card = "flex flex-col gap-[18px] rounded-[20px] border border-[#E2E4EE] bg-white p-6";

const SectionTitle = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-2.5">
    <h2 className="text-[12.5px] font-extrabold uppercase tracking-[0.07em] text-[#8A6119]">{children}</h2>
    <span className="h-px min-w-5 flex-1 bg-[#E8E4D6]" />
    {right}
  </div>
);

export default function TemplateManager() {
  const [items, setItems] = useState<Tpl[] | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [comms, setComms] = useState<Opt[]>([]);
  const [error, setError] = useState("");
  const [sel, setSel] = useState<string | null>(null); // id template, atau "NEW"
  const [ver, setVer] = useState(0);
  const dirty = useRef(false);

  const load = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([callApi("GET", "/api/v1/templates"), callApi("GET", "/api/v1/teams"), callApi("GET", "/api/v1/lookups/rooms"), callApi("GET", "/api/v1/lookups/communities")]);
    if (!a.ok) return setError(errMsg(a.data));
    setItems(a.data.items ?? a.data); setError("");
    if (b.ok) setTeams(b.data.items);
    if (c.ok) setRooms(c.data.items);
    if (d.ok) setComms(d.data.items);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (items && sel === null) setSel(items[0]?.id ?? "NEW"); }, [items, sel]);

  async function pick(id: string) {
    if (id === sel) return;
    if (dirty.current && !(await askConfirm("Perubahan pada template ini belum disimpan dan akan hilang bila Anda pindah.", { title: "Tinggalkan template ini?", confirmLabel: "Tinggalkan", danger: true }))) return;
    dirty.current = false; setSel(id); setVer((v) => v + 1);
  }
  const current = items?.find((t) => t.id === sel) ?? null;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex items-center gap-3 rounded-[14px] border border-[#EBDDB8] bg-[#FFFDF7] px-4 py-3 text-[13.5px] font-semibold text-[#6F4304]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
        Template dan waktu default bisa diubah oleh Superadmin dan Penjadwal. Mengubah template tidak mengubah acara yang sudah dibuat.
      </div>
      {error && <p className="rounded-xl border border-[#F2C9C9] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#9B1C1C]" role="alert">{error}</p>}
      {!items && !error && <p className="text-sm text-[var(--ink-2)]">Memuat…</p>}

      {items && (
        <div className="flex flex-wrap items-start gap-5">
          {/* Daftar template */}
          <section className="flex min-w-[280px] max-md:min-w-0 max-w-[340px] flex-[1_1_300px] flex-col gap-3 lg:sticky lg:top-[calc(var(--header-h)+16px)]">
            {items.map((t, i) => {
              const p = PAL[i % PAL.length]; const on = sel === t.id;
              return (
                <button key={t.id} type="button" onClick={() => pick(t.id)} aria-current={on} className="flex items-center gap-3.5 rounded-[18px] bg-white p-3.5 text-left"
                  style={{ border: `1.5px solid ${on ? p.border : "#E2E4EE"}`, boxShadow: on ? "0 4px 14px rgba(48,55,168,0.12)" : "none" }}>
                  <span className="flex h-[58px] w-12 flex-none items-center justify-center text-[13px] font-extrabold" style={{ borderRadius: "24px 24px 8px 8px", background: p.bg, color: p.fg }} aria-hidden="true">{dot(t.startTime)}</span>
                  <span className="flex min-w-0 flex-col gap-[3px]">
                    <span className="truncate text-[15.5px] font-extrabold">{t.name}</span>
                    <span className="text-[13px] font-medium text-[#565B76]">{subText({ ...t, room: t.room.name })}</span>
                  </span>
                </button>
              );
            })}
            {sel === "NEW" && (
              <div className="flex items-center gap-3.5 rounded-[18px] border-[1.5px] border-[#3037A8] bg-white p-3.5" style={{ boxShadow: "0 4px 14px rgba(48,55,168,0.12)" }}>
                <span className="flex h-[58px] w-12 flex-none items-center justify-center text-xl font-extrabold text-[#2A2F8F]" style={{ borderRadius: "24px 24px 8px 8px", background: "#E8E9FA" }} aria-hidden="true">＋</span>
                <span className="text-[15.5px] font-extrabold">Template baru</span>
              </div>
            )}
            <button type="button" onClick={() => pick("NEW")} className="flex h-14 items-center justify-center gap-2.5 rounded-2xl border-[1.5px] border-dashed border-[#9AA0D6] bg-[#F6F7FE] text-sm font-bold text-[#2A2F8F] hover:bg-[#eef0fd]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Template baru
            </button>
          </section>

          {/* Editor */}
          {sel && (
            <Editor key={`${sel}:${ver}`} tpl={current} pal={PAL[Math.max(0, items.findIndex((t) => t.id === sel)) % PAL.length]} teams={teams} rooms={rooms} comms={comms}
              onDirty={(d) => { dirty.current = d; }}
              onSaved={async (id) => { dirty.current = false; await load(); setSel(id); setVer((v) => v + 1); }}
              onDeleted={async () => { dirty.current = false; await load(); setSel(null); setVer((v) => v + 1); }}
              onReset={() => { dirty.current = false; setVer((v) => v + 1); }} />
          )}
        </div>
      )}
    </div>
  );
}

function Editor({ tpl, pal, teams, rooms, comms, onDirty, onSaved, onDeleted, onReset }: {
  tpl: Tpl | null; pal: (typeof PAL)[number]; teams: Team[]; rooms: Room[]; comms: Opt[];
  onDirty: (d: boolean) => void; onSaved: (id: string) => Promise<void>; onDeleted: () => Promise<void>; onReset: () => void;
}) {
  const isNew = !tpl;
  const [name, setName] = useState(tpl?.name ?? "");
  const [pat, setPat] = useState(tpl ? patKey(tpl) : "W:0");
  const [start, setStart] = useState(tpl?.startTime ?? "07:00");
  const [hours, setHours] = useState(String((tpl?.durationMin ?? 120) / 60));
  const [roomId, setRoomId] = useState(tpl?.isOnline ? rooms.find((r) => r.isActive)?.id ?? "" : tpl?.room.id ?? rooms.find((r) => r.isActive)?.id ?? "");
  // template online: tanpa ruangan; pembicara dan tema diisi per acara karena berganti-ganti
  const [onl, setOnl] = useState<OnlineValue>(tpl?.isOnline
    ? { ...emptyOnline, online: true, url: tpl.online?.url ?? "", audience: tpl.online?.communityIds.length ? "COMMUNITIES" : "ALL", communityIds: tpl.online?.communityIds ?? [], reminder: tpl.online?.reminder ?? true }
    : emptyOnline);
  const [att, setAtt] = useState(tpl ? (tpl.attendanceModeDefault === "NAMES" ? `NAMES:${tpl.attendanceCommunity?.id ?? ""}` : "COUNT") : "COUNT");
  const [slots, setSlots] = useState<SlotState>(Object.fromEntries((tpl?.slots ?? []).map((s) => [s.ministryId, { count: s.count, rehearsal: s.rehearsalRequired }])));
  const [extra, setExtra] = useState<string[]>([]); // tim yang baru ditambahkan dan belum punya posisi
  const [addingTeam, setAddingTeam] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const minutes = Math.min(720, Math.max(15, Math.round((Number(hours) || 0) * 60)));
  const snap = () => JSON.stringify({ name: name.trim(), pat, start, minutes, roomId, onl, att, slots: Object.entries(slots).sort(([a], [b]) => a.localeCompare(b)) });
  const initial = useRef(snap());
  const isDirty = isNew || snap() !== initial.current;
  useEffect(() => { onDirty(isDirty); }); // eslint-disable-line react-hooks/exhaustive-deps

  const patOptions = useMemo(() => {
    const weekly = DAYS.map((d, i) => ({ v: `W:${i}`, l: `Setiap ${d}` }));
    const monthly = DAYS.flatMap((d, i) => [1, 2, 3, 4, 5].map((n) => ({ v: `M:${i}:${n}`, l: `${d} ${ordText(n)} tiap bulan` })));
    return { weekly, monthly };
  }, []);

  const bump = (m: TeamMin, delta: number) =>
    setSlots((cur) => {
      const next = { ...cur }; const n = (cur[m.id]?.count ?? 0) + delta;
      if (n <= 0) delete next[m.id]; else next[m.id] = { count: Math.min(n, 10), rehearsal: cur[m.id]?.rehearsal ?? m.rehearsalRequiredDefault };
      return next;
    });
  const toggleRehearsal = (m: TeamMin) => setSlots((cur) => (cur[m.id] ? { ...cur, [m.id]: { ...cur[m.id], rehearsal: !cur[m.id].rehearsal } } : cur));

  const shownTeams = teams.filter((t) => extra.includes(t.id) || t.ministries.some((m) => slots[m.id]));
  const freeTeams = teams.filter((t) => !shownTeams.includes(t));
  const total = Object.values(slots).reduce((n, s) => n + s.count, 0);

  async function save() {
    if (!name.trim()) return setError("Nama acara wajib diisi.");
    if (!onl.online && !roomId) return setError("Pilih ruangan.");
    const problem = onlineProblem(onl, "IBADAH");
    if (problem) return setError(problem);
    const [mode, commId] = att.split(":");
    const body = {
      name: name.trim(), ...parsePat(pat), startTime: start, durationMin: minutes, ...(onl.online ? {} : { roomId }),
      online: onl.online, ...(onl.online ? { onlineUrl: onl.url.trim(), onlineCommunityIds: onl.audience === "COMMUNITIES" ? onl.communityIds : [], onlineReminder: onl.reminder } : {}),
      attendanceModeDefault: mode === "NAMES" ? "NAMES" : "COUNT", attendanceCommunityId: mode === "NAMES" && commId ? commId : null,
      slots: Object.entries(slots).map(([ministryId, s]) => ({ ministryId, count: s.count, rehearsalRequired: s.rehearsal })),
    };
    setBusy(true); setError("");
    const r = tpl ? await callApi("PUT", `/api/v1/templates/${tpl.id}`, body) : await callApi("POST", "/api/v1/templates", body);
    setBusy(false);
    if (!r.ok) return setError(errMsg(r.data));
    await onSaved(r.data?.id ?? tpl?.id ?? "");
  }
  async function remove() {
    if (!tpl || !(await askConfirm(`Hapus template "${tpl.name}"? Jadwal yang sudah dibuat dari template ini tidak ikut terhapus.`))) return;
    setBusy(true);
    const r = await callApi("DELETE", `/api/v1/templates/${tpl.id}`);
    setBusy(false);
    if (r.ok) await onDeleted(); else setError(errMsg(r.data));
  }

  return (
    <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
      {/* Default waktu & ruangan */}
      <div className={card}>
        <SectionTitle right={tpl && <button type="button" disabled={busy} onClick={remove} className="rounded-lg px-2.5 py-1 text-xs font-bold text-[#9B1C1C] hover:bg-[#FFF5F5]">Hapus template</button>}>Default waktu &amp; ruangan</SectionTitle>
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-bold text-[#565B76]">Nama acara
            <input className={fld} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="mis. Ibadah Minggu I" autoFocus={isNew} />
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-bold text-[#565B76]">Pola ulang
            <select className={fld} value={pat} onChange={(e) => setPat(e.target.value)}>
              <optgroup label="Mingguan">{patOptions.weekly.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</optgroup>
              <optgroup label="Bulanan">{patOptions.monthly.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</optgroup>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-bold text-[#565B76]">Jam mulai
            <input type="time" className={fld} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-[12.5px] font-bold text-[#565B76]">Durasi (jam)
            <input type="number" min={0.25} max={12} step={0.25} className={fld} value={hours} onChange={(e) => setHours(e.target.value)} />
          </label>
          {!onl.online && (
            <label className="flex flex-col gap-1.5 text-[12.5px] font-bold text-[#565B76]">Ruangan
              <select className={fld} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                {rooms.filter((r) => r.isActive || r.id === roomId).map((r) => <option key={r.id} value={r.id}>{r.name}{r.floor != null ? ` · Lantai ${r.floor}` : ""}{r.isActive ? "" : " (nonaktif)"}</option>)}
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-[12.5px] font-bold text-[#565B76]">Kehadiran default
            <select className={fld} value={att} onChange={(e) => setAtt(e.target.value)}>
              <option value="COUNT">Jumlah saja</option>
              <option value="NAMES:">Per nama</option>
              {comms.map((c) => <option key={c.id} value={`NAMES:${c.id}`}>Per nama · {c.name}</option>)}
            </select>
          </label>
        </div>
        <OnlineFields kind="IBADAH" noSpeaker value={onl} onChange={setOnl} hint="Berlaku untuk acara yang dibuat dari template ini; acara yang sudah ada tidak berubah. Pembicara dan tema diisi di tiap acara. Acara online tanpa ruangan dan tanpa latihan." />
        <span className="text-[13px] font-semibold text-[#565B76]">Selesai otomatis: <span className="font-extrabold text-[#171A2C]">{dot(endTime(start || "00:00", minutes))}</span></span>
      </div>

      {/* Tim & posisi bawaan */}
      <div className={card}>
        <SectionTitle right={onl.online ? undefined : <span className="flex items-center gap-[7px] text-[12.5px] font-semibold text-[#565B76]"><span className="size-2 rounded-full bg-[#C28E2C]" />wajib latihan</span>}>Tim &amp; posisi bawaan</SectionTitle>
        {shownTeams.length === 0 && <p className="text-sm font-medium text-[#565B76]">Belum ada posisi. Tambahkan tim bawaan di bawah.</p>}
        {shownTeams.map((t) => (
          <div key={t.id} className="flex flex-wrap items-start gap-x-3.5 gap-y-2.5">
            <span className="flex-none pt-[9px] text-sm font-bold sm:basis-[130px]">{t.name}</span>
            <div className="flex min-w-[260px] flex-[1_1_300px] flex-wrap gap-2">
              {t.ministries.filter((m) => slots[m.id]).flatMap((m) =>
                Array.from({ length: slots[m.id].count }, (_, i) => (
                  <PosChip key={`${m.id}-${i}`} label={slots[m.id].count > 1 ? `${m.name} ${i + 1}` : m.name} req={!onl.online && slots[m.id].rehearsal} onToggle={() => { if (!onl.online) toggleRehearsal(m); }} onRemove={() => bump(m, -1)} />
                )),
              )}
              <AddPosition team={t} slots={slots} onAdd={(m) => bump(m, 1)} />
            </div>
          </div>
        ))}
        {!addingTeam ? (
          <button type="button" disabled={freeTeams.length === 0} onClick={() => setAddingTeam(true)} className="h-[42px] self-start rounded-xl border-[1.5px] border-dashed border-[#C2A25E] bg-[#FFFDF7] px-4 text-[13.5px] font-bold text-[#6F4304] hover:bg-[#FFF5DC] disabled:opacity-50">+ Tim bawaan baru</button>
        ) : (
          <select autoFocus defaultValue="" aria-label="Pilih tim" className="h-[42px] self-start rounded-xl border-[1.5px] border-[#C2A25E] bg-[#FFFDF7] px-3 text-[13.5px] font-bold text-[#6F4304]"
            onBlur={() => setAddingTeam(false)} onChange={(e) => { if (e.target.value) setExtra((x) => [...x, e.target.value]); setAddingTeam(false); }}>
            <option value="">Pilih tim…</option>{freeTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <p className="text-xs font-medium text-[#565B76]">Klik sebuah posisi untuk menandai wajib latihan. Arahkan kursor lalu klik ✕ untuk menghapusnya. Posisi yang sama bisa ditambah lagi untuk kursi kedua dan seterusnya.</p>
      </div>

      {/* Buat jadwal dari template */}
      <GenerateBox tpl={tpl} pal={pal} dirty={isDirty} />

      {/* Bilah simpan */}
      {isDirty && (
        <div className="z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-[#EBDDB8] md:sticky md:bottom-4 bg-[#FFFDF7] px-5 py-3 shadow-[0_8px_24px_-12px_rgba(48,55,168,0.35)]">
          <span className="mr-auto text-sm font-bold text-[#6F4304]">{isNew ? "Template baru belum disimpan" : "Ada perubahan yang belum disimpan"} · {total} posisi</span>
          {error && <span className="basis-full text-sm font-semibold text-[#9B1C1C]" role="alert">{error}</span>}
          {!isNew && <button type="button" onClick={onReset} disabled={busy} className="h-11 rounded-xl border border-[#D0D3E8] bg-white px-5 text-sm font-bold text-[var(--primary-ink)] max-md:hidden">Batalkan</button>}
          <button type="button" className={`${btnPrimary} max-md:hidden`} disabled={busy} onClick={save}>{busy ? "Menyimpan…" : isNew ? "Simpan template" : "Simpan perubahan"}</button>
        </div>
      )}
      <Fab dot quick="save" actions={isDirty ? [
        { key: "save", label: busy ? "Menyimpan…" : isNew ? "Simpan template" : "Simpan perubahan", icon: "save", disabled: busy, busy, onClick: () => { void save(); } },
        ...(!isNew ? [{ key: "reset", label: "Batalkan perubahan", icon: "unpublish" as const, tone: "neutral" as const, disabled: busy, onClick: onReset }] : []),
      ] : []} />
      {!isDirty && error && <p className="text-sm font-semibold text-[#9B1C1C]" role="alert">{error}</p>}
    </section>
  );
}

/** Satu posisi di tim: klik = tandai wajib latihan; ✕ (saat kursor di atasnya) = hapus satu kursi. */
function PosChip({ label, req, onToggle, onRemove }: { label: string; req: boolean; onToggle: () => void; onRemove: () => void }) {
  return (
    <span className="group flex h-[38px] items-center rounded-full border border-[#E2E4EE] bg-[#F3F4F9] text-[13.5px] font-semibold">
      <button type="button" onClick={onToggle} aria-pressed={req} title={req ? "Wajib latihan (klik untuk batalkan)" : "Klik untuk menandai wajib latihan"} className="flex h-full items-center gap-2 rounded-full pl-3.5 pr-3.5 group-focus-within:pr-1.5 group-hover:pr-1.5">
        {req && <span className="size-2 rounded-full bg-[#C28E2C]" aria-hidden="true" />}{label}
      </button>
      <button type="button" onClick={onRemove} aria-label={`Hapus ${label}`} className="mr-2 hidden size-6 place-items-center rounded-full text-xs text-[#565B76] hover:bg-white group-focus-within:grid group-hover:grid">✕</button>
    </span>
  );
}

function AddPosition({ team, slots, onAdd }: { team: Team; slots: SlotState; onAdd: (m: TeamMin) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="h-[38px] rounded-full border-[1.5px] border-dashed border-[#C9CCDD] px-3.5 text-[13px] font-bold text-[#565B76] hover:bg-[#F3F4F9]">+ posisi</button>;
  return (
    <select autoFocus defaultValue="" aria-label={`Tambah posisi ${team.name}`} className="h-[38px] rounded-full border-[1.5px] border-[var(--primary)] bg-white px-3 text-[13px] font-bold"
      onBlur={() => setOpen(false)} onChange={(e) => { const m = team.ministries.find((x) => x.id === e.target.value); if (m) onAdd(m); setOpen(false); }}>
      <option value="">Pilih posisi…</option>
      {team.ministries.map((m) => <option key={m.id} value={m.id}>{m.name}{slots[m.id] ? " (tambah kursi)" : ""}</option>)}
    </select>
  );
}

const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function GenerateBox({ tpl, pal, dirty }: { tpl: Tpl | null; pal: (typeof PAL)[number]; dirty: boolean }) {
  const now = new Date();
  const [from, setFrom] = useState(isoLocal(new Date(now.getFullYear(), now.getMonth() + 1, 1)));
  const [to, setTo] = useState(isoLocal(new Date(now.getFullYear(), now.getMonth() + 2, 0)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ created: { id: string; date: string }[]; skipped: { date: string; reason: string }[] } | null>(null);

  const rangeError = !from || !to ? "Isi tanggal awal dan akhir." : to < from ? "Tanggal akhir harus setelah tanggal awal." : (Date.parse(to) - Date.parse(from)) / 86_400_000 > 366 ? "Maksimal rentang 1 tahun." : "";
  const dates = useMemo(() => (tpl && !rangeError ? [...eachDate(from, to)].filter((d) => matchesPattern(tpl, d)) : []), [tpl, from, to, rangeError]);
  const lbl = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${iso}T00:00:00Z`));

  async function generate() {
    if (!tpl) return;
    setBusy(true); setError(""); setResult(null);
    const r = await callApi("POST", `/api/v1/templates/${tpl.id}/generate`, { from, to });
    setBusy(false);
    if (r.ok) setResult({ created: r.data.created ?? [], skipped: r.data.skipped ?? [] }); else setError(errMsg(r.data));
  }

  const blocked = !tpl ? "Simpan template dulu untuk membuat jadwal." : dirty ? "Simpan perubahan dulu supaya pola terbaru dipakai." : "";
  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-[#E2E4EE] bg-white p-6">
      <SectionTitle>Buat jadwal dari template</SectionTitle>
      <div className="flex flex-wrap items-end gap-3.5">
        <label className="flex flex-col gap-1.5 text-[12.5px] font-bold text-[#565B76]">Dari tanggal
          <input type="date" className={`${fld} !w-40`} value={from} onChange={(e) => { setFrom(e.target.value); setResult(null); }} />
        </label>
        <label className="flex flex-col gap-1.5 text-[12.5px] font-bold text-[#565B76]">Sampai tanggal
          <input type="date" className={`${fld} !w-40`} value={to} onChange={(e) => { setTo(e.target.value); setResult(null); }} />
        </label>
        <button type="button" disabled={busy || !!blocked || !!rangeError || dates.length === 0} onClick={generate} className="h-[46px] rounded-xl bg-[var(--primary)] px-[22px] text-sm font-bold text-white hover:brightness-110 disabled:opacity-50">
          {busy ? "Membuat…" : `Buat ${dates.length} jadwal draft`}
        </button>
      </div>
      {rangeError && <p className="text-sm font-semibold text-[#9B1C1C]" role="alert">{rangeError}</p>}
      {blocked && <p className="text-sm font-semibold text-[#6F4304]">{blocked}</p>}
      {!blocked && !rangeError && dates.length === 0 && <p className="text-sm font-medium text-[#565B76]">Tidak ada tanggal yang cocok dengan pola template di rentang ini.</p>}
      <div className="flex flex-wrap gap-2.5">
        {dates.slice(0, 16).map((d) => (
          <div key={d.iso} className="flex h-[68px] w-14 flex-col items-center justify-center leading-[1.1]" style={{ borderRadius: "28px 28px 9px 9px", background: pal.bg, color: pal.fg }} aria-label={lbl(d.iso)}>
            <span className="text-[10px] font-bold tracking-[0.06em]">{WD3[d.weekday]}</span>
            <span className="text-[21px] font-extrabold">{Number(d.iso.slice(8, 10))}</span>
            <span className="text-[10px] font-bold">{MON3[Number(d.iso.slice(5, 7)) - 1]}</span>
          </div>
        ))}
        {dates.length > 16 && <div className="grid h-[68px] place-items-center px-2 text-sm font-bold text-[#565B76]">+{dates.length - 16} lagi</div>}
      </div>
      {error && <p className="text-sm font-semibold text-[#9B1C1C]" role="alert">{error}</p>}
      {result && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-[#E4F3EC] px-4 py-3 text-sm font-semibold text-[#14603E]">
          <span>✓ {result.created.length} jadwal draft dibuat. <Link href="/jadwal" className="underline">Buka Jadwal acara →</Link></span>
          {result.skipped.length > 0 && <span className="font-medium text-[#6F4304]">Dilewati: {result.skipped.map((s) => `${lbl(s.date)} (${s.reason})`).join(", ")}</span>}
        </div>
      )}
      <span className="text-[13px] font-medium leading-[1.45] text-[#565B76]">Jadwal dibuat sebagai DRAFT dengan posisi kosong. Orang dan ruangan baru dikunci setelah kamu mengisi dan menyimpan tiap jadwal.</span>
    </div>
  );
}
