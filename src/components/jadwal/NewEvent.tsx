"use client";

import Fab from "@/components/ui/Fab";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { btnGhost, btnPrimary, callApi, card, errMsg, inputCls } from "./api";
import { ymd } from "@/lib/ui";
import RoomOptions from "@/components/ui/RoomOptions";

type Tpl = { id: string; name: string; weekday: number; recurrence: string; ordinal: number | null; startTime: string; durationMin: number; room: { name: string }; pair: { id: string; name: string } | null };
type Team = { id: string; name: string };
type Room = { id: string; name: string; floor?: number | null; isActive: boolean };
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const longDate = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`));
const pattern = (t: Tpl) => (t.recurrence === "MONTHLY_NTH" ? `${DAYS[t.weekday]} ke-${t.ordinal === 5 ? "terakhir" : t.ordinal} tiap bulan` : `Tiap hari ${DAYS[t.weekday]}`);

export default function NewEvent() {
  const router = useRouter();
  const today = ymd(new Date());
  const [tab, setTab] = useState<"template" | "khusus">("template");
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  type Made = { id: string; number: string; date: string };
  type Skip = { date: string; reason: string };
  const [result, setResult] = useState<{ created: Made[]; skipped: Skip[]; mismatch?: { message: string; suggestions: string[] }; pair?: { template: string; created: Made[]; skipped: Skip[] } } | null>(null);

  const [tplId, setTplId] = useState("");
  const [withPair, setWithPair] = useState(true); // Ibadah Minggu 1/2: buat sekaligus pasangannya
  const [range, setRange] = useState(false);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const [k, setK] = useState({ title: "", date: today, start: "09:00", dur: 120, roomId: "", mode: "COUNT" });
  const [teamIds, setTeamIds] = useState<string[]>([]);

  useEffect(() => {
    callApi("GET", "/api/v1/templates").then((r) => { if (r.ok) { setTpls(r.data.items); setTplId(r.data.items[0]?.id ?? ""); } });
    callApi("GET", "/api/v1/teams").then((r) => r.ok && setTeams(r.data.items));
    callApi("GET", "/api/v1/lookups/rooms").then((r) => { if (r.ok) { setRooms(r.data.items); setK((x) => ({ ...x, roomId: r.data.items.find((m: Room) => m.isActive)?.id ?? "" })); } });
  }, []);

  const tpl = tpls.find((t) => t.id === tplId);

  async function generate(opt: { date?: string; ignorePattern?: boolean } = {}) {
    const f0 = opt.date ?? from;
    const t0 = opt.date ? opt.date : range ? to : from;
    if (opt.date) { setFrom(opt.date); setTo(opt.date); setRange(false); }
    setBusy(true); setError(""); setResult(null);
    const r = await callApi("POST", `/api/v1/templates/${tplId}/generate`, { from: f0, to: t0, ignorePattern: opt.ignorePattern || undefined, withPair: (tpl?.pair && withPair) || undefined });
    setBusy(false);
    if (!r.ok) return setError(errMsg(r.data));
    setResult(r.data);
    const single = f0 === t0;
    if (single && r.data.created.length === 1) router.push(`/jadwal/${r.data.created[0].id}`);
    else if (single && r.data.created.length === 0 && !r.data.mismatch) {
      // acara sudah ada di tanggal itu: buka saja
      const name = tpls.find((t) => t.id === tplId)?.name;
      const l = await callApi("GET", `/api/v1/events?from=${f0}&to=${f0}`);
      const hit = l.ok ? (l.data.items as { id: string; title: string; status: string }[]).find((e) => e.title === name && e.status !== "CANCELLED") : null;
      if (hit) router.push(`/jadwal/${hit.id}`);
    }
  }

  async function createOneOff() {
    setBusy(true); setError("");
    const r = await callApi("POST", "/api/v1/events", { title: k.title, date: k.date, startTime: k.start, durationMin: k.dur, roomId: k.roomId, attendanceMode: k.mode, teamTypeIds: teamIds });
    setBusy(false);
    if (!r.ok) return setError(errMsg(r.data));
    router.push(`/jadwal/${r.data.id}`);
  }

  const tab_ = (on: boolean) => `h-[38px] rounded-[9px] px-4 text-[13.5px] font-bold ${on ? "bg-white text-[var(--primary-ink)] shadow-sm" : "text-[var(--ink-2)]"}`;

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex gap-0.5 self-start rounded-xl bg-[#e7e9f3] p-1" role="group" aria-label="Jenis jadwal">
        <button className={tab_(tab === "template")} onClick={() => setTab("template")}>Dari template</button>
        <button className={tab_(tab === "khusus")} onClick={() => setTab("khusus")}>Acara khusus</button>
      </div>
      <Fab quick="create" actions={tab === "template"
        ? [{ key: "create", label: busy ? "Membuat…" : range ? "Buat jadwal" : "Buat dan buka", icon: "check", disabled: busy || !tplId, busy, onClick: () => { void generate(); } }]
        : [
          { key: "create", label: busy ? "Membuat…" : "Buat dan buka", icon: "check", disabled: busy || !k.title.trim() || !k.roomId, busy, onClick: () => { void createOneOff(); } },
          { key: "cancel", label: "Batal", icon: "cancel", tone: "neutral", href: "/jadwal" },
        ]} />
      {error && <p role="alert" className="rounded-xl bg-[#FBE4E4] px-4 py-3 text-sm font-semibold text-[#9B1C1C]">{error}</p>}

      {tab === "template" ? (
        <section className={card}>
          <p className="text-sm font-medium text-[var(--ink-2)]">Pilih template lalu tanggalnya. Posisi dan kursi mengikuti template, dan kursi dibiarkan kosong untuk diisi.</p>
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[13px] font-bold sm:col-span-2">Template
              <select className={inputCls} value={tplId} onChange={(e) => setTplId(e.target.value)}>{tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            </label>
            {tpl && <p className="text-xs font-semibold text-[var(--ink-2)] sm:col-span-2">{pattern(tpl)} · {tpl.startTime} · {tpl.durationMin / 60} jam · {tpl.room.name}</p>}
            <label className="flex flex-col gap-1.5 text-[13px] font-bold">{range ? "Dari tanggal" : "Tanggal"}<input type="date" className={inputCls} value={from} onChange={(e) => { setFrom(e.target.value); if (!range) setTo(e.target.value); }} /></label>
            {range && <label className="flex flex-col gap-1.5 text-[13px] font-bold">Sampai tanggal<input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></label>}
          </div>
          {tpl?.pair && (
            <label className="mt-3 flex items-start gap-2 rounded-xl border border-[#D0D3E8] bg-[#FAFAFF] px-3.5 py-3 text-sm font-semibold">
              <input type="checkbox" className="mt-0.5" checked={withPair} onChange={(e) => setWithPair(e.target.checked)} />
              <span>Buat juga {tpl.pair.name} di hari yang sama<span className="block text-xs font-medium text-[var(--ink-2)]">Personelnya biasanya sama. Setelah dibuat, kursinya bisa diisi dari yang satunya, atau diubah satu per satu.</span></span>
            </label>
          )}
          <label className="mt-3 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={range} onChange={(e) => setRange(e.target.checked)} /> Buat banyak sekaligus (rentang tanggal, hanya tanggal yang cocok pola template)</label>
          <div className="mt-5 max-md:hidden"><button className={btnPrimary} disabled={busy || !tplId} onClick={() => generate()}>{busy ? "Membuat…" : range ? "Buat jadwal" : "Buat dan buka"}</button></div>
          {result && (
            <div className="mt-4 flex flex-col gap-3 text-sm" role="status">
              {result.mismatch && (
                <div className="flex flex-col gap-3 rounded-xl border border-[#EAD9AE] bg-[#FFFBF0] p-4">
                  <span className="font-semibold text-[#6F4304]">{result.mismatch.message}</span>
                  <div className="flex flex-wrap gap-2">
                    {result.mismatch.suggestions.map((d) => (
                      <button key={d} className={`${btnGhost} h-10`} disabled={busy} onClick={() => generate({ date: d })}>Pakai {longDate(d)}</button>
                    ))}
                    {!range && <button className="h-10 rounded-xl border border-[#EAD9AE] bg-white px-4 text-sm font-bold text-[#6F4304] hover:bg-[#FFF5DC]" disabled={busy} onClick={() => generate({ date: from, ignorePattern: true })}>Tetap buat di {longDate(from)} (di luar pola)</button>}
                  </div>
                </div>
              )}
              {!result.mismatch && (
                <div className="flex flex-col gap-2 rounded-xl bg-[var(--bg)] p-4">
                  <span className="font-bold">{result.created.length > 0 ? `${result.created.length} jadwal dibuat${result.skipped.length ? `, ${result.skipped.length} dilewati` : ""}.` : "Tidak ada jadwal baru yang dibuat."}</span>
                  {result.created.map((c) => <Link key={c.id} href={`/jadwal/${c.id}`} className="font-semibold text-[var(--primary-ink)] underline">{longDate(c.date)} · {c.number}</Link>)}
                  {result.skipped.map((x) => <span key={x.date} className="font-medium text-[#6F4304]">{longDate(x.date)}: {x.reason}</span>)}
                  {result.pair && (
                    <>
                      <span className="mt-1 font-bold">{result.pair.template}: {result.pair.created.length > 0 ? `${result.pair.created.length} jadwal dibuat${result.pair.skipped.length ? `, ${result.pair.skipped.length} dilewati` : ""}.` : "tidak ada jadwal baru."}</span>
                      {result.pair.created.map((c) => <Link key={c.id} href={`/jadwal/${c.id}`} className="font-semibold text-[var(--primary-ink)] underline">{longDate(c.date)} · {c.number}</Link>)}
                      {result.pair.skipped.map((x) => <span key={x.date} className="font-medium text-[#6F4304]">{longDate(x.date)}: {x.reason}</span>)}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      ) : (
        <section className={card}>
          <p className="text-sm font-medium text-[var(--ink-2)]">Untuk acara satu kali di luar template. Posisi pelayan bisa ditambahkan setelah dibuat.</p>
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-[13px] font-bold sm:col-span-2">Nama acara<input className={inputCls} value={k.title} onChange={(e) => setK({ ...k, title: e.target.value })} placeholder="mis. Perjamuan Kudus" /></label>
            <label className="flex flex-col gap-1.5 text-[13px] font-bold">Tanggal<input type="date" className={inputCls} value={k.date} onChange={(e) => setK({ ...k, date: e.target.value })} /></label>
            <label className="flex flex-col gap-1.5 text-[13px] font-bold">Mulai<input type="time" className={inputCls} value={k.start} onChange={(e) => setK({ ...k, start: e.target.value })} /></label>
            <label className="flex flex-col gap-1.5 text-[13px] font-bold">Durasi (menit)<input type="number" min={15} max={720} step={15} className={inputCls} value={k.dur} onChange={(e) => setK({ ...k, dur: Number(e.target.value) })} /></label>
            <label className="flex flex-col gap-1.5 text-[13px] font-bold">Ruangan
              <select className={inputCls} value={k.roomId} onChange={(e) => setK({ ...k, roomId: e.target.value })}><RoomOptions rooms={rooms.filter((r) => r.isActive)} /></select>
            </label>
            <label className="flex flex-col gap-1.5 text-[13px] font-bold sm:col-span-2">Kehadiran dicatat
              <select className={inputCls} value={k.mode} onChange={(e) => setK({ ...k, mode: e.target.value })}><option value="COUNT">Jumlah saja</option><option value="NAMES">Per nama</option></select>
            </label>
          </div>
          <fieldset className="mt-4"><legend className="text-[13px] font-bold">Tim yang terlibat</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {teams.map((t) => {
                const on = teamIds.includes(t.id);
                return <button key={t.id} type="button" aria-pressed={on} onClick={() => setTeamIds(on ? teamIds.filter((x) => x !== t.id) : [...teamIds, t.id])} className={`h-9 rounded-full border px-3.5 text-[13px] font-bold ${on ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-ink)]" : "border-[var(--line)] bg-white text-[var(--ink-2)]"}`}>{t.name}</button>;
              })}
            </div>
          </fieldset>
          <div className="mt-5 flex gap-2.5 max-md:hidden"><button className={btnPrimary} disabled={busy || !k.title.trim() || !k.roomId} onClick={createOneOff}>{busy ? "Membuat…" : "Buat dan buka"}</button><Link href="/jadwal" className={`${btnGhost} inline-flex items-center`}>Batal</Link></div>
        </section>
      )}
    </div>
  );
}
