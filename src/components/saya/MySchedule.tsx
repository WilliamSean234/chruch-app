"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterBar, FSearch, FSelect, listCard } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import { useClientPaging } from "@/components/ui/usePagedList";
import { hm, MONTHS, MONTHS_AHEAD, MONTHS_BACK, REHEARSAL_TONE, toneFor, TZ, ymd } from "@/lib/ui";

export type ScheduleRow = {
  key: string; kind: "SERVICE" | "REHEARSAL"; eventId: string; title: string; startsAt: string; endsAt: string; room: string;
  role: string; status: string; rehearsalRequired: boolean; canAttend: boolean; attendanceMode: string; note?: string;
};

const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, ...o }).format(new Date(iso));
const dow = (iso: string) => fmt(iso, { weekday: "short" }).replace(".", "").toUpperCase();
const dom = (iso: string) => fmt(iso, { day: "numeric" });
const mon = (iso: string) => fmt(iso, { month: "short" }).replace(".", "").toUpperCase();
const dayText = (iso: string) => fmt(iso, { weekday: "long", day: "numeric", month: "short" });

/** Penanda tanggal berbentuk lengkung, seperti di desain. */
function DateChip({ iso, bg, fg, big }: { iso: string; bg: string; fg: string; big?: boolean }) {
  return (
    <div aria-hidden="true" style={{ background: bg, color: fg }}
      className={`flex flex-none flex-col items-center justify-center leading-[1.1] ${big ? "h-[70px] w-[58px] rounded-[29px_29px_9px_9px]" : "h-14 w-[46px] rounded-[23px_23px_8px_8px]"}`}>
      <span className={`font-bold ${big ? "text-[10px] tracking-[0.06em]" : "text-[9.5px]"}`}>{dow(iso)}</span>
      <span className={`font-extrabold ${big ? "text-2xl" : "text-[19px]"}`}>{dom(iso)}</span>
      {big && <span className="text-[10px] font-bold">{mon(iso)}</span>}
    </div>
  );
}

const chip = "whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-extrabold";

export default function MySchedule({ rows, note, nowIso }: { rows: ScheduleRow[]; note?: string; nowIso: string }) {
  const [now] = useState(() => Date.parse(nowIso));
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [month, setMonth] = useState(""); // "" = mendatang (semua bulan, hanya yang belum selesai); "YYYY-MM" = semua jadwal di bulan itu
  const [role, setRole] = useState("");

  const months = useMemo(() => {
    const cur = ymd(nowIso);
    const y = Number(cur.slice(0, 4)), m = Number(cur.slice(5, 7)) - 1;
    const out: { value: string; label: string }[] = [];
    for (let i = -MONTHS_BACK; i <= MONTHS_AHEAD; i++) {
      const d = new Date(Date.UTC(y, m + i, 1));
      out.push({ value: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}${i === 0 ? " (bulan ini)" : ""}` });
    }
    return out;
  }, [nowIso]);

  const roles = useMemo(() => [...new Set(rows.map((r) => r.role))].sort().map((v) => ({ value: v, label: v })), [rows]);

  // Pelayanan berikutnya: tidak ikut terkena filter, selalu yang terdekat untuk orang ini.
  const next = useMemo(() => rows.find((r) => r.kind === "SERVICE" && Date.parse(r.endsAt) >= now) ?? null, [rows, now]);
  const nextRehearsal = useMemo(() => (next ? rows.find((r) => r.kind === "REHEARSAL" && r.eventId === next.eventId && Date.parse(r.endsAt) >= now) ?? null : null), [rows, next, now]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (month === "" ? Date.parse(r.endsAt) < now : ymd(r.startsAt).slice(0, 7) !== month) return false;
      if (kind && r.kind !== kind) return false;
      if (role && r.role !== role) return false;
      if (needle && !`${r.title} ${r.role} ${r.room}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    return out;
  }, [rows, q, kind, month, role, now]);

  const pg = useClientPaging(list);
  const moreCount = [kind, role].filter(Boolean).length;
  const filtered = !!(q || month || moreCount);
  const reset = () => { setQ(""); setKind(""); setMonth(""); setRole(""); };
  const monthLabel = months.find((x) => x.value === month)?.label.replace(" (bulan ini)", "") ?? "";
  const heading = month ? monthLabel.toUpperCase() : "MENDATANG";

  if (note) {
    return <p className="rounded-2xl border border-[var(--line)] bg-white p-5 text-sm font-semibold text-[var(--ink-2)]">{note} Hubungi Penjadwal agar akunmu dihubungkan, lalu jadwal pelayananmu akan tampil di sini.</p>;
  }

  return (
    <>
      {next && (
        <section aria-label="Pelayanan berikutnya" className="relative flex flex-col gap-3.5 overflow-hidden rounded-[22px] bg-[var(--primary)] p-5 text-white md:max-w-2xl">
          <svg className="pointer-events-none absolute -bottom-[30px] -right-[18px] opacity-70" width="170" height="160" viewBox="0 0 170 160" fill="none" aria-hidden="true">
            <path d="M20 160V80C20 40 48 16 85 16s65 24 65 64v80" stroke="#E7C27A" strokeWidth="1.4" />
            <path d="M48 160V86c0-24 16-40 37-40s37 16 37 40v74" stroke="#E7C27A" strokeWidth="1.4" opacity="0.7" />
          </svg>
          <span className="relative text-xs font-extrabold tracking-[0.08em] text-[#E7C27A]">PELAYANAN BERIKUTNYA</span>
          <div className="relative flex items-center gap-3.5">
            <DateChip iso={next.startsAt} bg="#FFFFFF" fg="#2A2F8F" big />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xl font-extrabold leading-tight">{next.title}</span>
              <span className="text-sm font-semibold opacity-90">{next.role} · {hm(next.startsAt)}–{hm(next.endsAt)} · {next.room}</span>
            </div>
          </div>
          <div className="relative flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2.5 text-[13px] font-bold">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5" /><path d="M12 7v5l3 2" /></svg>
              {nextRehearsal ? `Wajib latihan · ${dayText(nextRehearsal.startsAt)}, ${hm(nextRehearsal.startsAt)}` : next.rehearsalRequired ? "Wajib latihan, jadwalnya belum ditetapkan" : "Tanpa latihan"}
            </span>
            {next.canAttend && <Link href={`/hadir/${next.eventId}`} className="flex h-10 items-center rounded-xl bg-white px-4 text-[13px] font-extrabold text-[var(--primary-ink)]">Isi kehadiran</Link>}
          </div>
        </section>
      )}

      <FilterBar active={filtered} onReset={reset} moreCount={moreCount}
        more={<>
          <FSelect label="Jenis" value={kind} onChange={setKind} options={[{ value: "SERVICE", label: "Pelayanan" }, { value: "REHEARSAL", label: "Latihan" }]} />
          <FSelect label="Peran" value={role} onChange={setRole} options={roles} />
        </>}>
        <FSearch value={q} onChange={setQ} placeholder="Acara, peran, atau ruangan" />
        <FSelect label="Bulan" value={month} onChange={setMonth} allLabel="Mendatang" options={months} />
      </FilterBar>

      <div className="flex items-center gap-2.5"><span className="text-xs font-extrabold tracking-[0.07em] text-[#8A6119]">{heading}</span><span className="h-px flex-1 bg-[#E8E4D6]" /></div>

      <div className={listCard}>
        {pg.slice.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm font-semibold text-[var(--ink-2)]">
            {filtered ? (month && !q && !moreCount ? `Tidak ada jadwal untukmu di ${monthLabel}.` : "Tidak ada jadwal yang cocok dengan filter.") : rows.length === 0 ? "Belum ada jadwal pelayanan untukmu dalam 6 bulan ke depan." : "Tidak ada jadwal mendatang. Pilih bulan untuk melihat jadwal yang sudah lewat."}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {pg.slice.map((r) => {
              const tone = r.kind === "REHEARSAL" ? REHEARSAL_TONE : toneFor(r.title);
              return (
                <li key={r.key} className="flex items-center gap-3.5 border-b border-[var(--line-2)] p-3.5 last:border-b-0">
                  <DateChip iso={r.startsAt} bg={tone.bg} fg={tone.fg} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-extrabold leading-snug">{r.title}</span>
                    <span className="text-[13px] font-medium text-[var(--ink-2)]">{r.kind === "SERVICE" ? `${r.role} · ` : ""}{hm(r.startsAt)}–{hm(r.endsAt)} · {r.room}</span>
                    {r.note && <span className="text-xs font-medium text-[var(--ink-2)]">{r.note}</span>}
                  </div>
                  <div className="flex flex-none flex-col items-end gap-1.5">
                    {r.kind === "REHEARSAL" && <span className={`${chip} bg-[#F7EBD2] text-[#6F4304]`}>Wajib</span>}
                    {r.kind === "SERVICE" && !r.rehearsalRequired && <span className={`${chip} bg-[#ECEEF4] text-[#3A3F58]`}>Tanpa latihan</span>}
                    {r.status === "DRAFT" && <span className={`${chip} bg-[#FBEFD6] text-[#6F4304]`}>Draf</span>}
                    {r.canAttend && <Link href={`/hadir/${r.eventId}`} className={`${chip} bg-[var(--primary-soft)] text-[var(--primary-ink)] hover:brightness-95`}>Isi kehadiran</Link>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pager page={pg.page} pageSize={pg.pageSize} total={pg.total} onPage={pg.setPage} onPageSize={pg.setPageSize} noun="jadwal" />
      </div>
    </>
  );
}
