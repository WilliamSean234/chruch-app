"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { seatSections, type SeatLite, type TeamLite } from "@/lib/seatSections";
import type { RehearsalEvent } from "@/lib/scheduleRows";
import { dayLong, hm, STATUS_LABEL } from "@/lib/ui";

type Detail = {
  id: string; number: string; title: string; status: string; startsAt: string; endsAt: string; room: { name: string };
  theme?: string | null; padus?: string | null; bandMode?: "BAND" | "NO_BAND";
  teams: TeamLite[]; seats: SeatLite[];
  rehearsals: { id: string; seq: number; startsAt: string; endsAt: string; room: { name: string }; note: string | null }[];
  pair?: { id: string; title: string } | null;
};

export type DialogTarget = {
  eventId: string; title: string; kind: "SERVICE" | "REHEARSAL"; startsAt: string; endsAt: string; room: string; status: string; canAttend: boolean;
  /** Acara yang memakai sesi ini. Untuk ibadah: acaranya sendiri. */
  events: RehearsalEvent[];
};

type Got = { id: string; res: "ok"; d: Detail } | { id: string; res: "gone" | "error" };
const sectionTitle = "text-xs font-extrabold uppercase tracking-[0.07em] text-[var(--gold-ink)]";
const get = async (id: string): Promise<Got> => {
  try {
    const r = await fetch(`/api/v1/events/${id}`, { cache: "no-store" });
    if (r.ok) return { id, res: "ok", d: (await r.json()) as Detail };
    return { id, res: r.status === 404 ? "gone" : "error" }; // 404 = masih draf (belum untuk umum) atau sudah dihapus
  } catch { return { id, res: "error" }; }
};

/**
 * Rincian satu jadwal dari daftar Jadwal saya (data yang sama dengan Kalender).
 * Ibadah: waktu, ruangan, petugas per tim. Latihan: acara yang dilatih (Ibadah Minggu 1 dan 2 bila latihannya dipakai bersama)
 * dan semua yang wajib hadir dari acara-acara itu.
 */
export default function EventDetailDialog({ target, myPersonId, onClose }: { target: DialogTarget; myPersonId: string | null; onClose: () => void }) {
  const [details, setDetails] = useState<Detail[]>([]);
  const [hidden, setHidden] = useState<RehearsalEvent[]>([]); // acara yang detailnya belum bisa dilihat (draf)
  const [state, setState] = useState<"loading" | "ok" | "gone" | "error">("loading");
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose; // supaya efek di bawah tidak berjalan ulang (dan merebut fokus) tiap induknya tampil ulang
  const isRehearsal = target.kind === "REHEARSAL";

  useEffect(() => {
    let live = true;
    setState("loading"); setDetails([]); setHidden([]);
    (async () => {
      const ids = isRehearsal ? target.events.map((e) => e.id) : [target.eventId];
      let all = await Promise.all(ids.map(get));
      if (isRehearsal) {
        // Latihan yang diikuti lewat satu acara bisa dipakai bersama acara pasangannya (jam dan ruangan sama): ikutkan bila memang sama.
        const pair = all.flatMap((x) => (x.res === "ok" ? [x.d.pair] : []))[0];
        if (pair && !ids.includes(pair.id)) {
          const p = await get(pair.id);
          if (p.res === "ok" && p.d.rehearsals.some((r) => r.startsAt === target.startsAt && r.endsAt === target.endsAt && r.room.name === target.room)) all = [...all, p];
        }
      }
      if (!live) return;
      const ok = all.flatMap((x) => (x.res === "ok" ? [x.d] : []));
      const gone = target.events.filter((e) => all.some((x) => x.id === e.id && x.res === "gone"));
      setDetails(ok); setHidden(gone);
      setState(ok.length ? "ok" : all.every((x) => x.res === "error") ? "error" : "gone");
    })();
    return () => { live = false; };
  }, [target, isRehearsal]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; opener?.focus?.(); };
  }, []);

  // Petugas per tim, gabungan semua acara; orang yang sama di kursi yang sama (mis. Bass di Minggu 1 dan 2) hanya satu baris.
  const sections = useMemo(() => {
    const by = new Map<string, { title: string; seats: (SeatLite & { k: string })[] }>();
    const seen = new Set<string>();
    for (const d of details) {
      for (const s of seatSections(d.teams, d.seats, isRehearsal)) {
        const g = by.get(s.title) ?? { title: s.title, seats: [] };
        for (const seat of s.seats) {
          const k = `${s.title}|${seat.label}|${seat.person?.id}`;
          if (seen.has(k)) continue;
          seen.add(k);
          g.seats.push({ ...seat, k });
        }
        by.set(s.title, g);
      }
    }
    return [...by.values()];
  }, [details, isRehearsal]);

  const forEvents = useMemo(() => {
    const rows = [
      ...details.map((d) => ({ id: d.id, title: d.title, startsAt: d.startsAt, endsAt: d.endsAt, room: d.room.name, draft: d.status === "DRAFT" })),
      ...hidden.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, room: "", draft: true })),
    ];
    return rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [details, hidden]);

  const st = STATUS_LABEL[target.status] ?? STATUS_LABEL.DRAFT;
  const first = details[0];
  const single = details.length === 1;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#171a2c]/45 p-4 backdrop-blur-[2px]" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="evd-title"
        className="flex max-h-[88vh] w-full max-w-[480px] flex-col gap-4 overflow-y-auto rounded-[22px] border border-[var(--line)] bg-white p-6 shadow-[0_24px_60px_-20px_rgba(30,34,90,0.5)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="evd-title" className="m-0 text-lg font-extrabold leading-snug">{target.title}</h2>
            <p className="m-0 text-sm font-semibold text-[var(--ink-2)]">{dayLong(target.startsAt)}</p>
            <p className="m-0 text-sm font-semibold text-[var(--ink-2)]">{hm(target.startsAt)}–{hm(target.endsAt)} · {target.room}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Tutup"
            className="grid size-9 flex-none place-items-center rounded-full text-[var(--ink-2)] hover:bg-[var(--bg)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: st.bg, color: st.fg }}>{st.text}</span>
          {!isRehearsal && first && <span className="text-xs font-semibold text-[var(--ink-2)]">{first.number}</span>}
          {!isRehearsal && first?.bandMode === "NO_BAND" && <span className="whitespace-nowrap rounded-full bg-[var(--gold-soft)] px-2.5 py-[3px] text-xs font-bold text-[#6F4304]">No Band</span>}
        </div>

        {state === "loading" && <p className="m-0 py-4 text-center text-sm font-semibold text-[var(--ink-2)]" role="status">Memuat petugas…</p>}
        {state === "gone" && <p className="m-0 rounded-xl bg-[var(--bg)] p-3.5 text-sm font-semibold text-[var(--ink-2)]">Daftar petugas belum bisa dilihat karena jadwal ini masih draf. Setelah diterbitkan Penjadwal, daftarnya muncul di sini.</p>}
        {state === "error" && <p role="alert" className="m-0 rounded-xl bg-[#FFF5F5] p-3.5 text-sm font-semibold text-[#9B1C1C]">Gagal memuat petugas. Tutup lalu coba lagi.</p>}

        {state === "ok" && first && (
          <>
            {isRehearsal && forEvents.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl bg-[var(--bg)] p-3">
                <span className="text-[11.5px] font-semibold text-[var(--ink-2)]">Latihan untuk acara</span>
                {forEvents.map((e) => (
                  <div key={e.id} className="flex flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-extrabold">{e.title}{e.draft && <span className="rounded-full bg-[#FBEFD6] px-2 py-0.5 text-[11px] font-bold text-[#6F4304]">Draf</span>}</span>
                    <span className="text-[13px] font-semibold text-[var(--ink-2)]">{dayLong(e.startsAt)}, {hm(e.startsAt)}–{hm(e.endsAt)}{e.room ? ` · ${e.room}` : ""}</span>
                  </div>
                ))}
              </div>
            )}

            {(!isRehearsal || single) && (first.theme || first.padus) && (
              <div className="flex flex-col gap-2">
                {first.theme && <div className="flex flex-col gap-0.5"><span className="text-[11.5px] font-semibold text-[var(--ink-2)]">Tema</span><span className="whitespace-pre-line break-words text-sm font-bold">{first.theme}</span></div>}
                {first.padus && <div className="flex flex-col gap-0.5"><span className="text-[11.5px] font-semibold text-[var(--ink-2)]">Padus</span><span className="break-words text-sm font-bold">{first.padus}</span></div>}
              </div>
            )}

            {isRehearsal && <p className="m-0 text-[13px] font-semibold text-[var(--ink-2)]">Yang wajib hadir di latihan ini:</p>}
            {sections.length === 0 && <p className="m-0 text-[13px] text-[var(--ink-2)]">{isRehearsal ? "Belum ada petugas yang wajib latihan." : "Belum ada petugas yang dijadwalkan."}</p>}
            {sections.map((s) => (
              <div key={s.title} className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5"><span className={sectionTitle}>{s.title}</span><span className="h-px flex-1 bg-[#E8E4D6]" /></div>
                {s.seats.map((seat) => (
                  <div key={seat.k} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-[var(--ink-2)]">{seat.label}</span>
                    <span className="flex items-center gap-2 text-right font-bold">
                      {myPersonId && seat.person?.id === myPersonId && <span className="whitespace-nowrap rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary-ink)]">Saya</span>}
                      {seat.person?.name}
                      {seat.person && seat.ministryName === "Pembicara" && (
                        <span className="whitespace-nowrap rounded-full bg-[var(--gold-soft)] px-2 py-0.5 text-[11px] font-bold text-[#6F4304]" title={seat.person.originChurch ?? undefined}>{seat.person.origin === "LUAR" ? "Luar" : "Dalam"}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {isRehearsal && hidden.length > 0 && <p className="m-0 text-xs font-medium text-[var(--ink-2)]">Petugas {hidden.map((e) => e.title).join(", ")} baru terlihat setelah acaranya diterbitkan.</p>}

            {!isRehearsal && first.rehearsals.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5"><span className={sectionTitle}>Latihan</span><span className="h-px flex-1 bg-[#E8E4D6]" /></div>
                {first.rehearsals.map((r) => (
                  <div key={r.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="font-medium text-[var(--ink-2)]">Latihan {r.seq}</span>
                    <span className="text-right font-bold">{dayLong(r.startsAt)}, {hm(r.startsAt)}–{hm(r.endsAt)} · {r.room.name}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {target.canAttend && <Link href={`/hadir/${target.eventId}`} className="flex h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-4 text-sm font-extrabold text-white hover:brightness-110">Isi kehadiran</Link>}
      </div>
    </div>
  );
}
