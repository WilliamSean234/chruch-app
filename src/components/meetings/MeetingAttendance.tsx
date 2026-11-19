"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/master/Modal";
import { FilterBar, FSearch, FSelect } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import { useClientPaging } from "@/components/ui/usePagedList";
import { btnGhost, btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";
import type { DraftRow } from "./useMeetingDraft";

export type Participant = { id: string; personId: string | null; name: string; isGuest: boolean; status: string; note: string | null; positions: string[] };
export type Attendance = {
  invited: number; present: number; excused: number; absent: number; pending: number; guests: number; guestsPresent: number;
  percent: number; quorumMin: number | null; quorumMet: boolean | null;
};

const eyebrow = "text-xs font-extrabold tracking-[0.07em] text-[var(--gold-ink)]";
const card = "flex flex-col gap-3.5 rounded-[20px] border border-[var(--line)] bg-white p-[22px]";

/** Warna status kehadiran; dipakai juga oleh panel kalender. */
export const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  PRESENT: { label: "Hadir", bg: "#E3F3E7", fg: "#1B6B34" },
  EXCUSED: { label: "Izin", bg: "#FBF0D9", fg: "#6F4304" },
  ABSENT: { label: "Tidak hadir", bg: "#FBE4E4", fg: "#9B1C1C" },
  INVITED: { label: "Belum dicatat", bg: "#ECEEF4", fg: "#565B76" },
};

function Rule({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2.5"><span className={eyebrow}>{children}</span><span className="h-px flex-1 bg-[#e8e4d6]" /></div>;
}

export function QuorumChip({ a }: { a: Attendance }) {
  if (a.quorumMin == null || a.quorumMet == null) return null;
  return a.quorumMet
    ? <span className="rounded-full bg-[#E3F3E7] px-2.5 py-[3px] text-xs font-extrabold text-[#1B6B34]">Kuorum {a.quorumMin}% terpenuhi</span>
    : <span className="rounded-full bg-[#FBF0D9] px-2.5 py-[3px] text-xs font-extrabold text-[#6F4304]">Belum memenuhi kuorum {a.quorumMin}%</span>;
}

export type AttendanceActions = {
  mark: (row: DraftRow, next: string) => void;
  markAllPresent: () => void;
  removeRow: (row: DraftRow) => void;
  undoRemove: (row: DraftRow) => void;
  addPeople: (members: { personId: string; name: string }[], guests: string[]) => void;
  inviteAll: () => void;
};

/**
 * Kartu "Undangan & kehadiran" di halaman rapat. Hanya dirender untuk anggota kelompok.
 * Semua perubahan hanya ditampung (lihat useMeetingDraft) dan baru disimpan lewat tombol "Simpan perubahan" di atas halaman.
 */
export default function MeetingAttendance({ groupId, groupName, rows, attendance, canRecord, cancelled, inviteAllStaged, actions }: {
  groupId: string; groupName: string; rows: DraftRow[]; attendance: Attendance; canRecord: boolean; cancelled: boolean; inviteAllStaged: boolean; actions: AttendanceActions;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((p) => (!needle || p.name.toLowerCase().includes(needle)) && (!status || p.status === status) && (!kind || (kind === "GUEST" ? p.isGuest : !p.isGuest)));
  }, [rows, q, status, kind]);
  const paging = useClientPaging(shown);
  const dirty = !!(q || status || kind);
  const participants = rows;
  const live = rows.filter((r) => !r.removed);

  const a = attendance;
  return (
    <div className={card}>
      <Rule>UNDANGAN &amp; KEHADIRAN</Rule>

      {participants.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <span className="text-sm font-medium text-[var(--ink-2)]">{inviteAllStaged ? `Seluruh anggota ${groupName} akan diundang setelah Anda menekan Simpan perubahan.` : "Belum ada peserta yang diundang untuk rapat ini."}</span>
          {canRecord && !inviteAllStaged && <button type="button" onClick={actions.inviteAll} className={btnPrimary}>Undang seluruh anggota {groupName}</button>}
        </div>
      ) : (
        <>
          {live.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-[15px] font-extrabold">{a.present} dari {a.invited} anggota hadir ({a.percent}%)</span>
                <QuorumChip a={a} />
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-[#ECEEF4]" role="img" aria-label={`${a.percent}% anggota hadir`}>
                <div className="h-full rounded-full bg-[#2F9E57]" style={{ width: `${a.percent}%` }} />
                {a.quorumMin != null && <span className="absolute top-0 h-full w-0.5 bg-[var(--ink)]" style={{ left: `${a.quorumMin}%` }} title={`Batas kuorum ${a.quorumMin}%`} />}
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs font-bold">
                {([["EXCUSED", a.excused], ["ABSENT", a.absent], ["INVITED", a.pending]] as const).map(([k, n]) => (
                  <span key={k} className="whitespace-nowrap rounded-full px-2.5 py-[3px]" style={{ background: STATUS[k].bg, color: STATUS[k].fg }}>{STATUS[k].label} {n}</span>
                ))}
                {a.guests > 0 && <span className="whitespace-nowrap rounded-full bg-[#fbf0d9] px-2.5 py-[3px] text-[#6f4304]">Tamu {a.guestsPresent}/{a.guests} hadir</span>}
              </div>
            </div>
          )}

          {canRecord && (
            <div className="flex flex-wrap gap-2.5">
              {live.some((p) => p.status === "INVITED") && (
                <button type="button" onClick={actions.markAllPresent} className="h-10 rounded-xl border border-[#cfe6d6] bg-[#f3faf5] px-4 text-[13px] font-bold text-[#1b6b34] hover:bg-[#e8f5ec]">Tandai semua yang belum dicatat: hadir</button>
              )}
              <button type="button" onClick={() => setAddOpen(true)} className="h-10 rounded-xl border border-[#d0d3e8] bg-white px-4 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[#f3f4f9]">+ Tambah peserta atau tamu</button>
            </div>
          )}

          <FilterBar surface="card" active={dirty} onReset={() => { setQ(""); setStatus(""); setKind(""); }}
            more={<FSelect label="Jenis" value={kind} onChange={setKind} allLabel="Anggota dan tamu" width="w-48" options={[{ value: "MEMBER", label: "Anggota saja" }, { value: "GUEST", label: "Tamu saja" }]} />}
            moreCount={kind ? 1 : 0}>
            <FSearch value={q} onChange={setQ} placeholder="Cari nama peserta" />
            <FSelect label="Status" value={status} onChange={setStatus} allLabel="Semua status" width="w-44"
              options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))} />
          </FilterBar>

          <div className="overflow-hidden rounded-xl border border-[var(--line)]">
            {paging.slice.length === 0 && <p className="px-4 py-6 text-center text-sm font-semibold text-[var(--ink-2)]">{dirty ? "Tidak ada peserta yang cocok dengan filter ini." : "Belum ada peserta."}</p>}
            {paging.slice.map((p) => {
              const st = STATUS[p.status] ?? STATUS.INVITED;
              return (
                <div key={p.id} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--line-2)] px-4 py-3 first:border-t-0 ${p.removed ? "bg-[#fdf6f6]" : p.isNew || p.changed ? "bg-[#fffdf5]" : ""}`}>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className={`flex flex-wrap items-center gap-2 text-sm font-bold ${p.removed ? "text-[var(--ink-2)] line-through" : ""}`}>
                      {p.name}
                      {p.isGuest && <span className="whitespace-nowrap rounded-full bg-[#fbf0d9] px-2 py-0.5 text-[11px] font-extrabold text-[#6f4304] no-underline">Tamu</span>}
                      {p.isNew && <span className="whitespace-nowrap rounded-full bg-[#EEF0FD] px-2 py-0.5 text-[11px] font-extrabold text-[#3037A8] no-underline">Baru</span>}
                      {p.removed && <span className="whitespace-nowrap rounded-full bg-[#FBE4E4] px-2 py-0.5 text-[11px] font-extrabold text-[#9B1C1C] no-underline">Akan dihapus</span>}
                      {p.changed && !p.removed && <span className="whitespace-nowrap rounded-full bg-[#FBF0D9] px-2 py-0.5 text-[11px] font-extrabold text-[#6F4304] no-underline">Diubah</span>}
                    </span>
                    {p.positions.length > 0 && <span className="text-xs font-medium text-[var(--ink-2)]">{p.positions.join(", ")}</span>}
                  </div>
                  {canRecord && p.removed ? (
                    <button type="button" onClick={() => actions.undoRemove(p)} className="h-8 rounded-lg px-3 text-[12.5px] font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Urungkan</button>
                  ) : canRecord ? (
                    <div className="flex items-center gap-1.5">
                      <div role="group" aria-label={`Kehadiran ${p.name}`} className="flex gap-1 rounded-xl bg-[#ECEEF4] p-1">
                        {(["PRESENT", "EXCUSED", "ABSENT"] as const).map((k) => {
                          const on = p.status === k;
                          return (
                            <button key={k} type="button" onClick={() => actions.mark(p, k)} aria-pressed={on} title={on ? "Klik lagi untuk mengosongkan" : undefined}
                              className="h-8 rounded-lg px-3 text-[12.5px] font-bold"
                              style={on ? { background: STATUS[k].bg, color: STATUS[k].fg, boxShadow: `inset 0 0 0 1.5px ${STATUS[k].fg}55` } : { color: "#565B76" }}>
                              {STATUS[k].label}
                            </button>
                          );
                        })}
                      </div>
                      <button type="button" onClick={() => actions.removeRow(p)} aria-label={`Hapus ${p.name}`} className="h-8 rounded-lg px-2.5 text-sm font-bold text-[var(--ink-2)] hover:bg-[var(--bg)]">✕</button>
                    </div>
                  ) : (
                    <span className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                  )}
                </div>
              );
            })}
            <Pager page={paging.page} pageSize={paging.pageSize} total={paging.total} onPage={paging.setPage} onPageSize={paging.setPageSize} noun="peserta" />
          </div>
        </>
      )}

      {cancelled && <span className="text-xs font-semibold text-[var(--ink-2)]">Rapat dibatalkan, daftar peserta tidak bisa diubah.</span>}
      {addOpen && <AddDialog groupId={groupId} taken={new Set(live.map((p) => p.personId).filter((x): x is string => !!x))} takenGuests={new Set(live.filter((p) => p.isGuest).map((p) => p.name.toLowerCase()))}
        onClose={() => setAddOpen(false)} onDone={(members, guests) => { actions.addPeople(members, guests); setAddOpen(false); }} />}
    </div>
  );
}

/** Tambah anggota yang belum diundang dan/atau tamu. */
function AddDialog({ groupId, taken, takenGuests, onClose, onDone }: { groupId: string; taken: Set<string>; takenGuests: Set<string>; onClose: () => void; onDone: (members: { personId: string; name: string }[], guests: string[]) => void }) {
  const [members, setMembers] = useState<{ personId: string; name: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [guests, setGuests] = useState<string[]>([]);
  const [guestInput, setGuestInput] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void callApi("GET", `/api/v1/groups/${groupId}`).then((r) => {
      if (!live) return;
      if (r.ok) setMembers((r.data.members as { personId: string; name: string; title: string | null }[]).map((m) => ({ personId: m.personId, name: m.title ? `${m.title} ${m.name}` : m.name })));
      else setError(errMsg(r.data));
    });
    return () => { live = false; };
  }, [groupId]);

  const available = useMemo(() => (members ?? []).filter((m) => !taken.has(m.personId)), [members, taken]);
  const shown = useMemo(() => { const n = q.trim().toLowerCase(); return available.filter((m) => !n || m.name.toLowerCase().includes(n)); }, [available, q]);
  const paging = useClientPaging(shown);
  const toggle = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const addGuest = () => {
    const g = guestInput.trim();
    if (g && !guests.some((x) => x.toLowerCase() === g.toLowerCase()) && !takenGuests.has(g.toLowerCase())) setGuests([...guests, g]);
    setGuestInput("");
  };
  const total = picked.size + guests.length;

  function confirmAdd() {
    onDone((members ?? []).filter((m) => picked.has(m.personId)), guests);
  }

  return (
    <Modal title="Tambah peserta" onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Batal</button>
        <button type="button" onClick={confirmAdd} disabled={total === 0} className={btnPrimary}>{total ? `Tambahkan ${total} peserta` : "Tambahkan"}</button>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-bold">Anggota yang belum diundang</span>
          {members === null && !error && <p className="text-sm font-medium text-[var(--ink-2)]">Memuat anggota…</p>}
          {members && available.length === 0 && <p className="text-sm font-medium text-[var(--ink-2)]">Semua anggota sudah diundang.</p>}
          {available.length > 0 && (
            <div className="flex flex-col gap-2 overflow-hidden rounded-xl border border-[var(--line)] pt-3">
              <div className="flex flex-wrap items-center gap-2 px-3">
                <input aria-label="Cari anggota" placeholder="Cari anggota…" value={q} onChange={(e) => setQ(e.target.value)} className={`${inputCls} !h-10 min-w-[140px] flex-1`} />
                <button type="button" onClick={() => setPicked((prev) => new Set([...prev, ...shown.map((m) => m.personId)]))} className="h-9 rounded-full border-[1.5px] border-dashed border-[#9aa0d6] bg-[#f6f7fe] px-3 text-[13px] font-bold text-[var(--primary-ink)]">{q.trim() ? "Pilih hasil" : "Pilih semua"}</button>
              </div>
              <div className="flex flex-col gap-1.5 px-3">
                {paging.slice.map((m) => (
                  <label key={m.personId} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[13.5px] font-semibold ${picked.has(m.personId) ? "border-[var(--primary)] bg-[#f1f2fd]" : "border-[var(--line)]"}`}>
                    <input type="checkbox" checked={picked.has(m.personId)} onChange={() => toggle(m.personId)} className="size-4 accent-[var(--primary)]" />{m.name}
                  </label>
                ))}
                {shown.length === 0 && <p className="py-2 text-sm font-medium text-[var(--ink-2)]">Tidak ada anggota yang cocok.</p>}
              </div>
              <Pager page={paging.page} pageSize={paging.pageSize} total={paging.total} onPage={paging.setPage} onPageSize={paging.setPageSize} noun="anggota" className="!border-t-0" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-bold">Tamu <span className="font-medium text-[var(--ink-2)]">(tidak dihitung untuk kuorum)</span></span>
          <div className="flex gap-2">
            <input aria-label="Nama tamu" placeholder="Nama tamu" maxLength={80} value={guestInput} onChange={(e) => setGuestInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGuest(); } }} className={`${inputCls} flex-1`} />
            <button type="button" onClick={addGuest} disabled={!guestInput.trim()} className="h-11 rounded-xl border border-[#d0d3e8] bg-white px-4 text-sm font-bold text-[var(--primary-ink)] disabled:opacity-50">+ Tamu</button>
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
        {error && <p role="alert" className="text-sm font-semibold text-[#9b1c1c]">{error}</p>}
      </div>
    </Modal>
  );
}
