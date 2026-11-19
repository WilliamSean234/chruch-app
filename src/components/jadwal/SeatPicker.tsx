"use client";

import { useEffect, useState } from "react";
import { callApi, errMsg, inputCls, btnPrimary, btnGhost } from "./api";
import { initials } from "@/lib/ui";
import NewPersonInline from "@/components/master/NewPersonInline";

type Service = { team: string; items: { name: string; current: boolean }[] };
type Cand = { id: string; name: string; services: Service[]; capable: boolean; isCurrent: boolean; conflicts: string[] };

/** Saran orang untuk satu kursi: tersedia / tidak tersedia pada jam acara (dan jam latihan bila wajib). */
export default function SeatPicker({ eventId, seatId, seatLabel, timeLabel, canAddPerson, onPick, onClose }: {
  eventId: string; seatId: string; seatLabel: string; timeLabel: string; canAddPerson: boolean; onPick: (personId: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [others, setOthers] = useState(false);
  const [data, setData] = useState<{ seat: { ministryId: string; ministry: string }; available: Cand[]; unavailable: Cand[] } | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null); // orang yang daftar pelayanannya sedang dibuka
  const [adding, setAdding] = useState(false);
  const [allAvail, setAllAvail] = useState(false); // tampilkan semua yang tersedia
  const [showBusy, setShowBusy] = useState(false); // buka daftar tidak tersedia
  const searching = q.trim().length > 0;
  const SHOW = 6;

  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await callApi("GET", `/api/v1/events/${eventId}/seats/${seatId}/suggestions?includeOthers=${others}${q ? `&search=${encodeURIComponent(q)}` : ""}`);
      if (r.ok) {
        setData(r.data); setError("");
        // Posisi baru belum punya orang yang tercatat bisa: langsung tampilkan semua orang.
        if (!others && !q && r.data.available.length + r.data.unavailable.length === 0) setOthers(true);
      } else setError(errMsg(r.data));
    }, 200);
    return () => clearTimeout(t);
  }, [eventId, seatId, q, others]);

  const total = (c: Cand) => c.services.reduce((n, g) => n + g.items.length, 0);
  const sub = (c: Cand, busy: boolean) =>
    busy ? c.conflicts[0] : [c.capable ? null : "belum tercatat bisa posisi ini", c.isCurrent ? "saat ini" : null].filter(Boolean).join(" · ") || "Tersedia";

  const row = (c: Cand, busy: boolean) => (
    <div key={c.id} className="rounded-xl hover:bg-[var(--bg)]">
      <div className="flex items-center gap-3 px-2.5 py-2">
        <span className={`grid size-9 flex-none place-items-center rounded-full text-xs font-bold ${busy ? "bg-[#ECEEF4] text-[#8B90AA]" : "bg-[var(--primary-soft)] text-[var(--primary-ink)]"}`} aria-hidden="true">{initials(c.name)}</span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className={`truncate text-sm font-bold ${busy ? "text-[#8B90AA]" : ""}`}>{c.name}</span>
          <span className={`truncate text-xs ${busy ? "text-[#B05A1C]" : "text-[var(--ink-2)]"}`}>{sub(c, busy)}</span>
          <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} aria-expanded={open === c.id}
            className="mt-1 w-fit rounded-md text-xs font-bold text-[var(--primary-ink)] hover:underline">
            Pelayanan ({total(c)}) {open === c.id ? "▴" : "▾"}
          </button>
        </span>
        <button type="button" onClick={() => onPick(c.id)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${busy ? "text-[#B05A1C] hover:bg-[#FFF5E8]" : "text-[var(--primary)] hover:bg-white"}`}>
          {busy ? "Bentrok" : "Pilih"}
        </button>
      </div>
      {open === c.id && (
        <div className="mx-2.5 mb-2 ml-[58px] flex flex-col gap-1.5 rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-[13px]">
          {c.services.length === 0 && <span className="text-[var(--ink-2)]">Belum ada pelayanan tercatat.</span>}
          {c.services.map((g) => (
            <div key={g.team} className="flex flex-col">
              <span className="text-[11px] font-extrabold tracking-[0.06em] text-[#7A5410]">{g.team.toUpperCase()}</span>
              <ol className="ml-4 list-decimal">
                {g.items.map((i) => <li key={i.name} className={i.current ? "font-extrabold text-[var(--primary-ink)]" : "font-semibold"}>{i.name}{i.current ? " (posisi ini)" : ""}</li>)}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#D0D3E8] bg-[#FAFAFF] p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-extrabold">Pilih untuk posisi {seatLabel}</span>
        <button type="button" onClick={onClose} className="rounded-lg px-2.5 py-1 text-xs font-bold text-[var(--ink-2)] hover:bg-white">Tutup</button>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama…" aria-label="Cari nama" className="h-10 rounded-xl border border-[var(--line)] bg-white px-3.5 text-sm font-semibold" />
      <label className="flex items-center gap-2 text-xs font-semibold text-[var(--ink-2)]">
        <input type="checkbox" checked={others} onChange={(e) => setOthers(e.target.checked)} /> Tampilkan juga orang yang belum tercatat bisa posisi ini
      </label>
      {error && <p className="text-sm font-semibold text-[#9B1C1C]">{error}</p>}
      {!data && !error && <p className="text-sm text-[var(--ink-2)]">Memuat…</p>}
      {data && (
        <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto pr-1">
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px] font-extrabold tracking-[0.07em] text-[#1B6B34]">TERSEDIA ({data.available.length}) · {timeLabel}</span>
            {data.available.length === 0 && <span className="px-2.5 text-sm text-[var(--ink-2)]">Tidak ada yang tersedia.</span>}
            {(allAvail || searching ? data.available : data.available.slice(0, SHOW)).map((c) => row(c, false))}
            {!allAvail && !searching && data.available.length > SHOW && (
              <button type="button" onClick={() => setAllAvail(true)} className="w-fit rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--primary-ink)] hover:bg-white">
                Lihat {data.available.length - SHOW} lainnya ▾
              </button>
            )}
          </div>
          {data.unavailable.length > 0 && (
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => setShowBusy((v) => !v)} aria-expanded={showBusy || searching}
                className="flex w-fit items-center gap-1 rounded-lg px-1 py-1 text-[11.5px] font-extrabold tracking-[0.07em] text-[#B05A1C] hover:bg-white">
                TIDAK TERSEDIA ({data.unavailable.length}) {showBusy || searching ? "▴" : "▾"}
              </button>
              {(showBusy || searching) && data.unavailable.map((c) => row(c, true))}
            </div>
          )}
        </div>
      )}
      {canAddPerson && data && (adding
        ? <NewPersonInline ministry={{ id: data.seat.ministryId, name: data.seat.ministry }} initialName={q} onCancel={() => setAdding(false)} onCreated={(p) => onPick(p.id)} />
        : <button type="button" onClick={() => setAdding(true)} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#B9BDDA] text-sm font-bold text-[var(--primary-ink)] hover:bg-white">
            ＋ Tambah orang baru{q ? ` “${q}”` : ""}
          </button>)}
    </div>
  );
}
