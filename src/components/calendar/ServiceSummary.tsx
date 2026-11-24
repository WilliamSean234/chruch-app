"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hm, MONTHS, toneFor, WEEKDAYS, ymd } from "@/lib/ui";
import type { DropPerson } from "./AssignDropDialog";

type Svc = { eventId: string; startsAt: string; title: string; seat: string; status: string };
type Person = { id: string; name: string; count: number; drafts: number; services: Svc[]; can: string[]; ministryIds: string[] };
type Idle = { id: string; name: string; can: string[]; ministryIds: string[] };
type Data = { level: "all" | "team" | "self"; totalServices: number; people: Person[]; idle: Idle[]; note?: string };

const PER_PAGE = 10; // orang per halaman di daftar rekap
const IDLE_PER_PAGE = 12; // orang per halaman di "belum dijadwalkan"

/** Hari (MIN..SAB), angka tanggal, dan tanggal ISO dalam zona gereja — sama dengan yang dipakai sel kalender. */
function dateBits(iso: string) {
  const key = ymd(iso);
  const [y, m, d] = key.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { iso: key, day: d, weekday: WEEKDAYS[wd], sunday: wd === 0 };
}

function initials(name: string): string {
  const parts = name.replace(/^(Ps|Pdt|Pdp|Gl|Kak)\.?\s+/i, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Pager ringkas: "Menampilkan 1–10 dari 36" + Sebelumnya/Berikutnya + nomor halaman. */
function Pager({ page, per, total, onPage }: { page: number; per: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (total <= per) return null;
  const from = (page - 1) * per + 1;
  const to = Math.min(total, page * per);
  // Nomor halaman: 1 … (p-1) p (p+1) … N
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const btn = "grid h-8 min-w-8 place-items-center rounded-lg px-2 text-xs font-bold transition disabled:opacity-40";
  return (
    <nav aria-label="Halaman" className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <span className="text-xs font-semibold text-[var(--ink-2)]">Menampilkan {from}–{to} dari {total}</span>
      <span className="flex items-center gap-1">
        <button type="button" className={`${btn} border border-[var(--line)] hover:bg-[var(--bg)]`} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Halaman sebelumnya">‹</button>
        {nums.map((n, i) =>
          n === "…" ? (
            <span key={`d${i}`} className="px-1 text-xs font-bold text-[var(--ink-2)]" aria-hidden="true">…</span>
          ) : (
            <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}
              className={`${btn} ${n === page ? "bg-[var(--primary)] text-white" : "border border-[var(--line)] hover:bg-[var(--bg)]"}`}>{n}</button>
          ),
        )}
        <button type="button" className={`${btn} border border-[var(--line)] hover:bg-[var(--bg)]`} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Halaman berikutnya">›</button>
      </span>
    </nav>
  );
}

/** Rekap pelayanan sebulan di bawah kalender. Latihan tidak dihitung. */
export default function ServiceSummary({ year, month0, teamId, myPersonId, activePersonId, onPickPerson, canDrag, onDragPerson, refreshKey = 0 }: {
  year: number; month0: number; teamId: string; myPersonId: string | null;
  activePersonId?: string | null; onPickPerson?: (p: { id: string; name: string } | null) => void;
  /** Penjadwal / Admin Tim: kartu "belum dijadwalkan" bisa diseret ke acara di kalender. */
  canDrag?: boolean; onDragPerson?: (p: DropPerson | null) => void;
  /** Naik setiap kali jadwal berubah dari luar (mis. setelah drop) supaya rekap dimuat ulang. */
  refreshKey?: number;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false); // bawaannya tertutup; judul tetap menampilkan jumlahnya
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showIdle, setShowIdle] = useState(false);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [idlePage, setIdlePage] = useState(1);
  const month = `${year}-${String(month0 + 1).padStart(2, "0")}`;
  const today = ymd(new Date());
  const lastKey = useRef(refreshKey);

  useEffect(() => {
    let live = true;
    // muat ulang karena jadwal berubah (refreshKey): jangan reset halaman / baris yang sedang dibuka
    const silent = lastKey.current !== refreshKey;
    lastKey.current = refreshKey;
    if (!silent) { setLoading(true); setExpanded(new Set()); setPage(1); setIdlePage(1); }
    setError("");
    const p = new URLSearchParams({ month });
    if (teamId) p.set("teamTypeId", teamId);
    fetch(`/api/v1/service-summary?${p}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => null) }))
      .then(({ ok, d }) => { if (!live) return; if (ok) setData(d as Data); else setError(d?.error?.message ?? "Gagal memuat rekap."); setLoading(false); });
    return () => { live = false; };
  }, [month, teamId, refreshKey]);

  const self = data?.level === "self";
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.people ?? []).filter((p) => !t || p.name.toLowerCase().includes(t));
  }, [data, q]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const curPage = Math.min(page, pageCount);
  const visible = self ? filtered : filtered.slice((curPage - 1) * PER_PAGE, curPage * PER_PAGE);

  const idleAll = data?.idle ?? [];
  const idleCount = Math.max(1, Math.ceil(idleAll.length / IDLE_PER_PAGE));
  const idleCur = Math.min(idlePage, idleCount);
  const idleVisible = idleAll.slice((idleCur - 1) * IDLE_PER_PAGE, idleCur * IDLE_PER_PAGE);

  const toggle = (id: string) => setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const title = self ? "Pelayanan saya" : data?.level === "team" ? "Rekap pelayanan tim Anda" : "Rekap pelayanan";

  return (
    <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-[22px] py-4 text-left">
        <span className="flex flex-col gap-0.5">
          <span className="text-[17px] font-extrabold tracking-tight">{title} · {MONTHS[month0]} {year}</span>
          <span className="text-xs font-semibold text-[var(--ink-2)]">
            {loading ? "Memuat…" : data ? `${data.totalServices} pelayanan${self ? "" : ` · ${data.people.length} orang`}. Latihan tidak dihitung.` : ""}
          </span>
        </span>
        <span className={`text-lg font-bold text-[var(--ink-2)] transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true">›</span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-[var(--line)] px-[22px] py-4">
          {error && <p role="alert" className="rounded-xl bg-[#FBE4E4] px-4 py-3 text-sm font-semibold text-[#9B1C1C]">{error}</p>}
          {data?.note && <p className="rounded-xl bg-[var(--gold-soft)] px-4 py-3 text-sm font-semibold text-[#6F4304]">{data.note}</p>}

          {!self && (data?.people.length ?? 0) > PER_PAGE && (
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Cari nama…" aria-label="Cari nama di rekap" className="h-10 max-w-xs rounded-xl border border-[var(--line)] px-3.5 text-sm font-semibold" />
          )}

          {!loading && data && data.people.length === 0 && !data.note && (
            <p className="py-4 text-center text-sm font-semibold text-[var(--ink-2)]">{self ? "Anda belum punya pelayanan di bulan ini." : "Belum ada pelayanan di bulan ini."}</p>
          )}

          {!self && onPickPerson && visible.length > 0 && (
            <p className="text-xs font-semibold text-[var(--ink-2)]">
              Klik nama untuk menampilkan jadwalnya saja di kalender. Klik panah untuk melihat rinciannya.{canDrag ? " Seret nama ke acara di kalender untuk menambah jadwalnya." : ""}
            </p>
          )}

          <ul className="flex flex-col">
            {visible.map((p) => {
              const on = expanded.has(p.id) || self;
              const active = !!activePersonId && p.id === activePersonId;
              const canPick = !self && !!onPickPerson;
              // HP: dua kolom berlebar tetap (draf | pelayanan) supaya rapi dan sejajar, apa pun panjang namanya.
              const badges = (
                <>
                  {p.drafts > 0
                    ? <span className="whitespace-nowrap rounded-full bg-[var(--gold-soft)] px-2 py-0.5 text-center text-[11px] font-bold text-[#6F4304] max-md:w-[48px]">{p.drafts} draf</span>
                    : <span className="max-md:w-[48px] md:hidden" aria-hidden="true" />}
                  <span className="whitespace-nowrap rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-center text-xs font-extrabold text-[var(--primary-ink)] max-md:w-[88px] max-md:px-1.5 max-md:text-[11.5px]">{p.count} pelayanan</span>
                </>
              );
              return (
                <li key={p.id} className={`border-b border-[var(--line-2)] last:border-b-0 ${active ? "rounded-xl bg-[var(--primary-soft)]/50" : ""}`}>
                  {self ? (
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <span className="truncate text-sm font-bold">{p.name}</span>
                      <span className="flex flex-none items-center gap-1.5">{badges}</span>
                    </div>
                  ) : (
                    <div className={`flex items-center gap-2 px-1 py-1.5 ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
                      draggable={!!canDrag}
                      onDragStart={(e) => {
                        if (!canDrag) return;
                        e.dataTransfer.effectAllowed = "copy";
                        e.dataTransfer.setData("text/plain", p.name);
                        onDragPerson?.({ id: p.id, name: p.name, can: p.can, ministryIds: p.ministryIds });
                      }}
                      onDragEnd={() => onDragPerson?.(null)}
                      title={canDrag ? "Seret ke acara di kalender untuk menambah jadwal" : undefined}>
                      <button type="button" onClick={() => toggle(p.id)} aria-expanded={on} aria-label={`${on ? "Tutup" : "Buka"} rincian ${p.name}`}
                        className="grid size-7 flex-none place-items-center rounded-lg text-sm font-bold text-[var(--ink-2)] hover:bg-[var(--bg)]">
                        <span className={`transition-transform ${on ? "rotate-90" : ""}`} aria-hidden="true">›</span>
                      </button>
                      {canPick ? (
                        <button type="button" onClick={() => onPickPerson!(active ? null : { id: p.id, name: p.name })} aria-pressed={active}
                          title={active ? "Klik untuk melepas filter di kalender" : `Tampilkan jadwal ${p.name} di kalender`}
                          className={`flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-left text-sm font-bold hover:bg-[var(--primary-soft)] hover:text-[var(--primary-ink)] max-md:flex-1 ${active ? "text-[var(--primary-ink)]" : ""}`}>
                          {active && <span className="grid size-4 flex-none place-items-center rounded-full bg-[var(--primary)] text-white md:hidden" aria-hidden="true"><svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.2l2.4 2.4 4.6-5" /></svg></span>}
                          <span className="min-w-0 truncate">{p.name}</span>
                        </button>
                      ) : (
                        <span className="min-w-0 truncate px-2 py-1 text-sm font-bold max-md:flex-1">{p.name}</span>
                      )}
                      {myPersonId && p.id === myPersonId && <span className="flex-none whitespace-nowrap rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary-ink)] max-md:hidden">Saya</span>}
                      {active && <span className="flex-none whitespace-nowrap rounded-full bg-[var(--primary)] px-2 py-0.5 text-[11px] font-bold text-white max-md:hidden">Di kalender</span>}
                      {/* bagian kosong + daftar pelayanan yang dikuasai + badge; ikut membuka rincian */}
                      <button type="button" onClick={() => toggle(p.id)} tabIndex={-1} aria-hidden="true" className="flex min-h-8 min-w-0 flex-1 items-center justify-end gap-1.5 max-md:flex-none">
                        {p.can.length > 0 && (
                          <span className="hidden min-w-0 items-center justify-end gap-1 overflow-hidden sm:flex" title={`Bisa: ${p.can.join(", ")}`}>
                            {p.can.slice(0, 3).map((c) => (
                              <span key={c} className="truncate rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-2)]">{c}</span>
                            ))}
                            {p.can.length > 3 && <span className="whitespace-nowrap flex-none rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--ink-2)]">+{p.can.length - 3}</span>}
                          </span>
                        )}
                        {badges}
                      </button>
                    </div>
                  )}
                  {on && (
                    <ul className="mb-2 ml-9 flex flex-col gap-1">
                      {p.services.map((s, i) => {
                        const t = toneFor(s.title);
                        const d = dateBits(s.startsAt);
                        const draft = s.status === "DRAFT";
                        return (
                          <li key={`${s.eventId}-${i}`} className="flex items-center gap-2.5" style={{ opacity: d.iso < today ? 0.62 : 1 }}>
                            {/* hari + tanggal, warna sama dengan kalender (Minggu keemasan, hari ini biru) */}
                            <span className="flex w-[46px] flex-none items-baseline justify-end gap-1">
                              <span className={`text-[10.5px] font-bold tracking-[0.06em] ${d.sunday ? "text-[var(--gold-ink)]" : "text-[var(--ink-2)]"}`}>{d.weekday}</span>
                              <span className={`text-[13px] font-extrabold ${d.iso === today ? "text-[var(--primary)]" : "text-[var(--ink)]"}`}>{d.day}</span>
                            </span>
                            {/* chip sama dengan kalender; Draf = garis putus-putus */}
                            <span
                              className={`flex min-h-[28px] min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-[11.5px] font-bold leading-tight ${draft ? "outline-dashed outline-1 outline-offset-[-1px]" : ""}`}
                              style={{ background: t.bg, color: t.fg, outlineColor: t.dot }}
                              title={`${s.title} — ${s.seat}${draft ? " (Draf)" : ""}`}>
                              <span className="size-[7px] flex-none rounded-full" style={{ background: t.dot }} aria-hidden="true" />
                              <span className="min-w-0 truncate">{hm(s.startsAt)} {t.short}</span>
                              <span className="ml-auto flex-none font-semibold opacity-80">{s.seat}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {!self && q && filtered.length === 0 && <p className="text-sm font-semibold text-[var(--ink-2)]">Tidak ada nama yang cocok.</p>}
          {!self && <Pager page={curPage} per={PER_PAGE} total={filtered.length} onPage={setPage} />}

          {!self && idleAll.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
              <button type="button" onClick={() => setShowIdle(!showIdle)} aria-expanded={showIdle} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
                <span className="flex flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-extrabold">
                    <span>Belum dijadwalkan bulan ini</span>
                    <span className="whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-xs font-extrabold text-[var(--primary-ink)] ring-1 ring-[var(--line)]">{idleAll.length} orang</span>
                  </span>
                  <span className="text-xs font-semibold text-[var(--ink-2)]">Punya posisi pelayanan, tapi belum kebagian jadwal di {MONTHS[month0]}.</span>
                </span>
                <span className={`font-bold text-[var(--ink-2)] transition-transform ${showIdle ? "rotate-90" : ""}`} aria-hidden="true">›</span>
              </button>
              {showIdle && (
                <div className="flex flex-col gap-3 border-t border-[var(--line)] bg-white px-4 py-4">
                  {canDrag && <p className="text-xs font-semibold text-[var(--ink-2)]">Seret kartu ke acara di kalender (draf maupun terbit) untuk menjadwalkan.</p>}
                  <ul className="grid gap-2.5 sm:grid-cols-2">
                    {idleVisible.map((p) => (
                      <li key={p.id}
                        draggable={!!canDrag}
                        onDragStart={(e) => {
                          if (!canDrag) return;
                          e.dataTransfer.effectAllowed = "copy";
                          e.dataTransfer.setData("text/plain", p.name); // Firefox butuh data agar drag mulai
                          onDragPerson?.({ id: p.id, name: p.name, can: p.can, ministryIds: p.ministryIds });
                        }}
                        onDragEnd={() => onDragPerson?.(null)}
                        title={canDrag ? "Seret ke acara di kalender untuk menjadwalkan" : undefined}
                        className={`flex items-start gap-3 rounded-xl border border-[var(--line-2)] px-3 py-2.5 ${canDrag ? "cursor-grab bg-white hover:border-[var(--primary)] hover:shadow-sm active:cursor-grabbing" : ""}`}>
                        <span className="grid size-9 flex-none place-items-center rounded-full bg-[var(--primary-soft)] text-xs font-extrabold text-[var(--primary-ink)]" aria-hidden="true">{initials(p.name)}</span>
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="truncate text-sm font-bold">{p.name}</span>
                          {p.can.length > 0 && (
                            <span className="flex flex-wrap gap-1">
                              {p.can.slice(0, 3).map((c) => (
                                <span key={c} className="whitespace-nowrap rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-2)]">{c}</span>
                              ))}
                              {p.can.length > 3 && <span className="whitespace-nowrap rounded-full bg-[var(--bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--ink-2)]" title={p.can.slice(3).join(", ")}>+{p.can.length - 3}</span>}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Pager page={idleCur} per={IDLE_PER_PAGE} total={idleAll.length} onPage={setIdlePage} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
