"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { seatSections, type SeatLite, type TeamLite } from "@/lib/seatSections";
import { dayLong, hm, STATUS_LABEL } from "@/lib/ui";

type Detail = {
  id: string; number: string; title: string; status: string; startsAt: string; endsAt: string; room: { name: string };
  theme?: string | null; padus?: string | null; bandMode?: "BAND" | "NO_BAND";
  teams: TeamLite[]; seats: SeatLite[];
  rehearsals: { id: string; seq: number; startsAt: string; endsAt: string; room: { name: string }; note: string | null }[];
};

export type DialogTarget = { eventId: string; title: string; kind: "SERVICE" | "REHEARSAL"; startsAt: string; endsAt: string; room: string; status: string; canAttend: boolean };

const sectionTitle = "text-xs font-extrabold uppercase tracking-[0.07em] text-[var(--gold-ink)]";

/** Rincian satu acara dari daftar Jadwal saya: waktu, ruangan, dan siapa saja petugasnya (data yang sama dengan Kalender). */
export default function EventDetailDialog({ target, myPersonId, onClose }: { target: DialogTarget; myPersonId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "gone" | "error">("loading");
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose; // supaya efek di bawah tidak berjalan ulang (dan merebut fokus) tiap induknya tampil ulang
  const isRehearsal = target.kind === "REHEARSAL";

  useEffect(() => {
    let live = true;
    setState("loading"); setDetail(null);
    fetch(`/api/v1/events/${target.eventId}`, { cache: "no-store" })
      .then(async (r) => {
        if (!live) return;
        if (r.ok) { setDetail(await r.json()); setState("ok"); }
        else setState(r.status === 404 ? "gone" : "error"); // 404 = masih draf (belum untuk umum) atau sudah dihapus
      })
      .catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [target.eventId]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; opener?.focus?.(); };
  }, []);

  const sections = useMemo(() => (detail ? seatSections(detail.teams, detail.seats, isRehearsal) : []), [detail, isRehearsal]);
  const st = STATUS_LABEL[target.status] ?? STATUS_LABEL.DRAFT;

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
          {detail && <span className="text-xs font-semibold text-[var(--ink-2)]">{detail.number}</span>}
          {detail?.bandMode === "NO_BAND" && <span className="whitespace-nowrap rounded-full bg-[var(--gold-soft)] px-2.5 py-[3px] text-xs font-bold text-[#6F4304]">No Band</span>}
        </div>

        {state === "loading" && <p className="m-0 py-4 text-center text-sm font-semibold text-[var(--ink-2)]" role="status">Memuat petugas…</p>}
        {state === "gone" && <p className="m-0 rounded-xl bg-[var(--bg)] p-3.5 text-sm font-semibold text-[var(--ink-2)]">Daftar petugas belum bisa dilihat karena jadwal ini masih draf. Setelah diterbitkan Penjadwal, daftarnya muncul di sini.</p>}
        {state === "error" && <p role="alert" className="m-0 rounded-xl bg-[#FFF5F5] p-3.5 text-sm font-semibold text-[#9B1C1C]">Gagal memuat petugas. Tutup lalu coba lagi.</p>}

        {state === "ok" && detail && (
          <>
            {(detail.theme || detail.padus) && (
              <div className="flex flex-col gap-2">
                {detail.theme && <div className="flex flex-col gap-0.5"><span className="text-[11.5px] font-semibold text-[var(--ink-2)]">Tema</span><span className="whitespace-pre-line break-words text-sm font-bold">{detail.theme}</span></div>}
                {detail.padus && <div className="flex flex-col gap-0.5"><span className="text-[11.5px] font-semibold text-[var(--ink-2)]">Padus</span><span className="break-words text-sm font-bold">{detail.padus}</span></div>}
              </div>
            )}

            {isRehearsal && (
              <div className="flex flex-col gap-0.5 rounded-xl bg-[var(--bg)] p-3">
                <span className="text-[11.5px] font-semibold text-[var(--ink-2)]">Latihan untuk acara</span>
                <span className="text-sm font-extrabold">{detail.title}</span>
                <span className="text-[13px] font-semibold text-[var(--ink-2)]">{dayLong(detail.startsAt)}, {hm(detail.startsAt)}–{hm(detail.endsAt)} · {detail.room.name}</span>
              </div>
            )}
            {isRehearsal && <p className="m-0 text-[13px] font-semibold text-[var(--ink-2)]">Yang wajib hadir di latihan ini:</p>}
            {sections.length === 0 && <p className="m-0 text-[13px] text-[var(--ink-2)]">{isRehearsal ? "Belum ada petugas yang wajib latihan." : "Belum ada petugas yang dijadwalkan."}</p>}
            {sections.map((s) => (
              <div key={s.title} className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5"><span className={sectionTitle}>{s.title}</span><span className="h-px flex-1 bg-[#E8E4D6]" /></div>
                {s.seats.map((seat) => (
                  <div key={seat.id} className="flex items-center justify-between gap-3 text-sm">
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

            {!isRehearsal && detail.rehearsals.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5"><span className={sectionTitle}>Latihan</span><span className="h-px flex-1 bg-[#E8E4D6]" /></div>
                {detail.rehearsals.map((r) => (
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
