"use client";

import Link from "next/link";
import { askConfirm } from "@/components/ui/Confirm";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Modal, { Field } from "@/components/master/Modal";
import { btnGhost, btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";
import MeetingAttendance, { type Attendance, type Participant } from "./MeetingAttendance";
import { useMeetingDraft, type DraftLink } from "./useMeetingDraft";
import { showToast } from "@/components/ui/Toast";
import SavedDialog from "@/components/ui/SavedDialog";
import Fab from "@/components/ui/Fab";
import { dayLong, hm } from "@/lib/ui";
import OnlineInfo, { type OnlineDto } from "@/components/online/OnlineInfo";

type LinkRow = { id: string; title: string; url: string };
export type MeetingDto = {
  id: string; number: string; status: string; cancelReason: string | null; startsAt: string; endsAt: string;
  room: { id: string; name: string }; group: { id: string; name: string; quorumMin: number | null };
  title: string | null; displayTitle: string; showTopic: boolean; showAttendees: boolean; createdBy: string | null;
  locked: boolean; links: LinkRow[];
  isOnline?: boolean; online?: OnlineDto | null;
  participants: Participant[]; attendance: Attendance | null; attendeesPublic: string[] | null;
  minutes: { status: string; version: number } | null;
  series: { text: string; index: number; total: number; later: number } | null;
  viewer: { isMember: boolean; canManage: boolean; canAttach: boolean; canRecord: boolean; canWriteMinutes: boolean };
};

const eyebrow = "text-xs font-extrabold tracking-[0.07em] text-[var(--gold-ink)]";
const card = "flex flex-col gap-3.5 rounded-[20px] border border-[var(--line)] bg-white p-[22px]";
const host = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };

function Rule({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2.5"><span className={eyebrow}>{children}</span><span className="h-px flex-1 bg-[#e8e4d6]" /></div>;
}

export default function MeetingDetail({ meeting: m }: { meeting: MeetingDto }) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"ONE" | "FOLLOWING">("ONE");
  const [lt, setLt] = useState("");
  const [lu, setLu] = useState("");
  const [linkErr, setLinkErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const cancelled = m.status === "CANCELLED";
  const draft = useMeetingDraft({ participants: m.participants, links: m.links, quorumMin: m.group.quorumMin });
  const dirty = draft.changeCount > 0;
  const canEdit = !m.locked && !cancelled && (m.viewer.canRecord || m.viewer.canAttach);

  // peringatan bila halaman ditutup atau dimuat ulang saat masih ada perubahan yang belum disimpan
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const saveChanges = async () => {
    setBusy(true); setError("");
    const r = await callApi("POST", `/api/v1/meetings/${m.id}/changes`, draft.payload());
    setBusy(false);
    if (r.ok) {
      const d = r.data as { removed: number; attendance: number; added: number; linksAdded: number; linksRemoved: number };
      const parts = [
        d.attendance && `${d.attendance} kehadiran diubah`, d.added && `${d.added} peserta ditambahkan`, d.removed && `${d.removed} peserta dihapus`,
        d.linksAdded && `${d.linksAdded} tautan ditambahkan`, d.linksRemoved && `${d.linksRemoved} tautan dihapus`,
      ].filter(Boolean);
      setSavedMsg(parts.join(", "));
      router.refresh();
    } else { setError(errMsg(r.data)); showToast("Perubahan belum tersimpan", "error"); }
  };
  const discard = async () => {
    if (await askConfirm("Buang semua perubahan? Perubahan kehadiran, peserta, dan lampiran yang belum disimpan akan dikembalikan seperti semula.", { confirmLabel: "Buang perubahan", danger: true })) { draft.reset(); setError(""); }
  };
  /** Pindah halaman dari tombol di halaman ini: tanya dulu bila ada perubahan yang belum disimpan. */
  const leave = (href: string) => async (e: React.MouseEvent) => {
    if (!dirty) return;
    e.preventDefault();
    if (await askConfirm("Perubahan belum disimpan. Tinggalkan halaman ini? Perubahan kehadiran, peserta, dan lampiran akan hilang.", { confirmLabel: "Tinggalkan", danger: true })) router.push(href);
  };

  const addLink = () => {
    const err = draft.addLink(lt, lu);
    setLinkErr(err ?? "");
    if (!err) { setLt(""); setLu(""); }
  };
  const cancel = async () => {
    setBusy(true); setError("");
    const r = await callApi("POST", `/api/v1/meetings/${m.id}/cancel`, { reason: reason.trim(), scope });
    setBusy(false);
    if (r.ok) { setCancelOpen(false); router.refresh(); } else setError(errMsg(r.data));
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="flex flex-wrap items-center gap-2.5">
          <span className="rounded-full bg-[#f8e6dd] px-3 py-1 text-[12.5px] font-extrabold text-[#7a3a1e]">Rapat {m.group.name}</span>
          {cancelled && <span className="whitespace-nowrap rounded-full bg-[#fbe4e4] px-3 py-1 text-xs font-extrabold text-[#9b1c1c]">Dibatalkan</span>}
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--ink-2)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
            Isi rapat tertutup, hanya untuk anggota {m.group.name}
          </span>
        </span>
        {(m.viewer.canManage || canEdit) && (
          <div className="flex flex-wrap items-center gap-3">
            {canEdit && dirty && <span className="text-[12.5px] font-bold text-[#6f4304]">{draft.changeCount} perubahan belum disimpan</span>}
            {canEdit && dirty && <button type="button" onClick={discard} disabled={busy} className="h-[46px] rounded-xl px-3 text-sm font-bold text-[var(--ink-2)] hover:bg-[#e9ebf3] disabled:opacity-50 max-md:hidden">Buang</button>}
            {canEdit && <button type="button" onClick={saveChanges} disabled={!dirty || busy} className={`${btnPrimary} !h-[46px] !px-[22px] max-md:hidden`}>{busy ? "Menyimpan…" : "Simpan perubahan"}</button>}
            {m.viewer.canManage && <Link href={`/rapat/${m.id}/ubah`} onClick={leave(`/rapat/${m.id}/ubah`)} className="flex h-[46px] items-center rounded-xl border border-[#d0d3e8] bg-white px-[18px] text-sm font-bold text-[var(--primary-ink)] hover:bg-[#f3f4f9] max-md:hidden">Ubah jadwal</Link>}
            {m.viewer.canManage && <button type="button" onClick={() => setCancelOpen(true)} className="h-[46px] rounded-xl border border-[#f0c7c7] bg-white px-[18px] text-sm font-bold text-[#9b1c1c] hover:bg-[#fdf1f1] max-md:hidden">Batalkan rapat</button>}
          </div>
        )}
      </div>

      <Fab dot={dirty} quick={canEdit && dirty ? "save" : undefined} actions={[
        ...(canEdit ? [{ key: "save", label: busy ? "Menyimpan…" : "Simpan perubahan", icon: "save" as const, tone: "primary" as const, disabled: !dirty || busy, busy, onClick: saveChanges }] : []),
        ...(canEdit && dirty ? [{ key: "discard", label: "Buang perubahan", icon: "unpublish" as const, tone: "neutral" as const, disabled: busy, onClick: discard }] : []),
        ...(m.viewer.canManage ? [{ key: "edit", label: "Ubah jadwal", icon: "edit" as const, tone: "neutral" as const, onClick: async () => { if (!dirty || await askConfirm("Perubahan belum disimpan. Tinggalkan halaman ini? Perubahan kehadiran, peserta, dan lampiran akan hilang.", { confirmLabel: "Tinggalkan", danger: true })) router.push(`/rapat/${m.id}/ubah`); } }] : []),
        ...(m.viewer.canManage ? [{ key: "cancel", label: "Batalkan rapat", icon: "cancel" as const, tone: "danger" as const, onClick: () => setCancelOpen(true) }] : []),
      ]} />

      {cancelled && (
        <div className="rounded-[14px] border border-[#f0c7c7] bg-[#fdf1f1] px-4 py-3 text-[13.5px] font-semibold text-[#9b1c1c]">
          Rapat ini dibatalkan{m.cancelReason ? `: ${m.cancelReason}` : "."} Ruangan sudah dilepas.
        </div>
      )}
      {error && <p role="alert" className="rounded-xl border border-[#f0c7c7] bg-[#fdf1f1] px-4 py-3 text-sm font-semibold text-[#9b1c1c]">{error}</p>}

      <div className="flex flex-wrap items-start gap-5">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
          <div className={card}>
            <Rule>JADWAL</Rule>
            {m.online && <div className="mb-3"><OnlineInfo online={m.online} showTheme /></div>}
            <div className="flex flex-col text-[14px]">
              {([["Tanggal", dayLong(m.startsAt)], ["Waktu", `${hm(m.startsAt)}–${hm(m.endsAt)}`], ["Ruangan", m.room.name], ["Kelompok", m.group.name]] as const).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-t border-[var(--line-2)] py-2.5 first:border-t-0"><span className="font-medium text-[var(--ink-2)]">{k}</span><span className="text-right font-bold">{v}</span></div>
              ))}
              {m.title && !m.viewer.isMember && <div className="flex justify-between gap-3 border-t border-[var(--line-2)] py-2.5"><span className="font-medium text-[var(--ink-2)]">Topik</span><span className="text-right font-bold">{m.title}</span></div>}
              {m.series && <div className="flex justify-between gap-3 border-t border-[var(--line-2)] py-2.5"><span className="font-medium text-[var(--ink-2)]">Berulang</span><span className="text-right font-bold">{m.series.text} · rapat {m.series.index} dari {m.series.total}</span></div>}
              <div className="flex justify-between gap-3 border-t border-[var(--line-2)] py-2.5"><span className="font-medium text-[var(--ink-2)]">Nomor</span><span className="font-bold">{m.number}</span></div>
              {m.createdBy && <div className="flex justify-between gap-3 border-t border-[var(--line-2)] py-2.5"><span className="font-medium text-[var(--ink-2)]">Dijadwalkan oleh</span><span className="font-bold">{m.createdBy}</span></div>}
              {m.attendeesPublic && m.attendeesPublic.length > 0 && <div className="flex justify-between gap-3 border-t border-[var(--line-2)] py-2.5"><span className="font-medium text-[var(--ink-2)]">Peserta</span><span className="text-right font-bold">{m.attendeesPublic.join(", ")}</span></div>}
              <div className="flex justify-between gap-3 border-t border-[var(--line-2)] py-2.5"><span className="font-medium text-[var(--ink-2)]">Di kalender umum</span>
                <span className="text-right font-bold">Waktu, ruangan{m.showTopic ? ", topik" : ""}{m.showAttendees ? ", peserta" : ""}</span></div>
            </div>
          </div>

          {m.locked ? (
            <div className="flex items-start gap-3 rounded-[20px] border border-dashed border-[#c4c8dc] bg-[var(--bg)] p-5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#565B76" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none"><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
              <span className="flex flex-col gap-1"><span className="text-sm font-extrabold text-[#3a3f58]">Isi rapat tertutup</span>
                <span className="text-[13px] font-medium leading-relaxed text-[var(--ink-2)]">Peserta, notulen, dan dokumen hanya untuk anggota {m.group.name}. Anda hanya melihat waktu dan ruangan.</span></span>
            </div>
          ) : (
            <>
              <MeetingAttendance groupId={m.group.id} groupName={m.group.name} rows={draft.rows} attendance={draft.summary}
                canRecord={m.viewer.canRecord && !cancelled} cancelled={cancelled} inviteAllStaged={draft.inviteAll}
                actions={{ mark: draft.mark, markAllPresent: draft.markAllPresent, removeRow: draft.removeRow, undoRemove: draft.undoRemove, addPeople: draft.addPeople, inviteAll: () => draft.setInviteAll(true) }} />
            <div className={card}>
              <Rule>NOTULEN</Rule>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex flex-wrap items-center gap-2.5">
                  {m.minutes ? (
                    <span className="whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-extrabold" style={m.minutes.status === "FINAL" ? { background: "#E3F3E7", color: "#1B6B34" } : { background: "#FBEFD6", color: "#6F4304" }}>
                      {m.minutes.status === "FINAL" ? `Final · versi ${m.minutes.version}` : m.minutes.version > 1 ? `Revisi · versi ${m.minutes.version} (draf)` : "Draf"}
                    </span>
                  ) : <span className="whitespace-nowrap rounded-full bg-[#ECEEF4] px-3 py-1 text-[12.5px] font-extrabold text-[#565B76]">Belum dibuat</span>}
                  <span className="text-[13px] font-medium text-[var(--ink-2)]">Agenda, pembahasan dan tindak lanjut, keputusan. Hanya untuk anggota {m.group.name}.</span>
                </span>
                {(m.minutes || m.viewer.canWriteMinutes) && (
                  <Link href={`/rapat/${m.id}/notulen`} onClick={leave(`/rapat/${m.id}/notulen`)} className="flex h-11 items-center rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:brightness-110">
                    {m.minutes ? "Buka notulen" : "Tulis notulen"}
                  </Link>
                )}
              </div>
            </div>
            <div className={card}>
              <Rule>LAMPIRAN</Rule>
              {draft.links.length === 0 && <span className="text-sm font-medium text-[var(--ink-2)]">Belum ada tautan. Sarankan memakai tautan (mis. Google Drive), bukan unggah berkas.</span>}
              {draft.links.map((l: DraftLink) => (
                <div key={l.id} className="flex items-center gap-2">
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className={`flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl border px-3 py-2.5 hover:bg-[#f6f7fe] ${l.removed ? "border-[#f0c7c7] bg-[#fdf6f6]" : l.isNew ? "border-[#EAD9AE] bg-[#fffdf5]" : "border-[var(--line)]"}`}>
                    <span className="flex items-center gap-2 text-sm font-bold">
                      <span className={`truncate ${l.removed ? "text-[var(--ink-2)] line-through" : ""}`}>{l.title}</span>
                      {l.isNew && <span className="whitespace-nowrap flex-none rounded-full bg-[#EEF0FD] px-2 py-0.5 text-[11px] font-extrabold text-[#3037A8]">Baru</span>}
                      {l.removed && <span className="whitespace-nowrap flex-none rounded-full bg-[#FBE4E4] px-2 py-0.5 text-[11px] font-extrabold text-[#9B1C1C]">Akan dihapus</span>}
                    </span>
                    <span className="truncate text-[12.5px] font-medium text-[var(--ink-2)]">{host(l.url)}</span>
                  </a>
                  {m.viewer.canAttach && !cancelled && (l.removed
                    ? <button type="button" onClick={() => draft.undoRemoveLink(l)} className="h-10 rounded-lg px-3 text-[12.5px] font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Urungkan</button>
                    : <button type="button" onClick={() => draft.removeLink(l)} aria-label={`Hapus tautan ${l.title}`} className="h-10 rounded-lg px-3 text-sm font-bold text-[var(--ink-2)] hover:bg-[var(--bg)]">✕</button>)}
                </div>
              ))}
              {m.viewer.canAttach && !cancelled && (
                <div className="flex flex-col gap-2 border-t border-[var(--line-2)] pt-3.5">
                  <div className="flex flex-wrap gap-2.5">
                    <input aria-label="Judul tautan" placeholder="Judul tautan" value={lt} onChange={(e) => setLt(e.target.value)} className={`${inputCls} min-w-[180px] flex-[1_1_180px]`} />
                    <input aria-label="Alamat tautan" placeholder="https://drive.google.com/…" value={lu} onChange={(e) => setLu(e.target.value)} className={`${inputCls} min-w-[240px] flex-[2_1_240px]`} />
                    <button type="button" onClick={addLink} disabled={!lt.trim() || !lu.trim()} className={btnGhost}>Tambah</button>
                  </div>
                  {linkErr && <p role="alert" className="text-[13px] font-semibold text-[#9b1c1c]">{linkErr}</p>}
                  <span className="text-xs font-medium text-[var(--ink-2)]">Tautan baru tersimpan setelah Anda menekan Simpan perubahan di atas.</span>
                </div>
              )}
            </div>
            </>
          )}
        </section>
      </div>

      {savedMsg !== null && (
        <SavedDialog title="Perubahan berhasil disimpan" message={savedMsg ? `${savedMsg.charAt(0).toUpperCase()}${savedMsg.slice(1)}.` : undefined} onClose={() => setSavedMsg(null)}
          actions={[
            { label: "Tetap di halaman ini", onClick: () => setSavedMsg(null) },
            { label: "Ke kalender", onClick: () => router.push("/") },
            { label: "Daftar rapat", onClick: () => router.push("/rapat"), primary: true },
          ]} />
      )}

      {cancelOpen && (
        <Modal title="Batalkan rapat" onClose={() => setCancelOpen(false)}
          footer={<>
            <button type="button" onClick={() => setCancelOpen(false)} className={btnGhost}>Kembali</button>
            <button type="button" onClick={cancel} disabled={busy || !reason.trim()} className="h-11 rounded-xl bg-[#b42318] px-5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50">{busy ? "Membatalkan…" : scope === "FOLLOWING" && m.series ? `Batalkan ${m.series.later + 1} rapat` : "Batalkan rapat"}</button>
          </>}>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium leading-relaxed text-[var(--ink-2)]">Ruangan {m.room.name} langsung dilepas dan rapat ini tidak tampil lagi di kalender.</p>
            {m.series && m.series.later > 0 && (
              <div role="radiogroup" aria-label="Yang dibatalkan" className="flex flex-col gap-2">
                {([["ONE", "Rapat ini saja", "Rapat berikutnya dalam seri tetap berjalan."], ["FOLLOWING", `Rapat ini dan ${m.series.later} rapat berikutnya`, "Seluruh sisa seri dibatalkan dan ruangannya dilepas."]] as const).map(([k, t, h]) => (
                  <button key={k} type="button" role="radio" aria-checked={scope === k} onClick={() => setScope(k)}
                    className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left ${scope === k ? "border-[1.5px] border-[var(--primary)] bg-[#f1f2fd]" : "border-[var(--line)] bg-white hover:bg-[#f6f7fe]"}`}>
                    <span className={`size-[18px] flex-none rounded-full bg-white ${scope === k ? "border-[5px] border-[var(--primary)]" : "border-[1.5px] border-[#b8bcd3]"}`} aria-hidden="true" />
                    <span className="flex min-w-0 flex-col gap-0.5"><span className="text-sm font-bold">{t}</span><span className="text-[12.5px] font-medium text-[var(--ink-2)]">{h}</span></span>
                  </button>
                ))}
              </div>
            )}
            <Field label="Alasan pembatalan"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={inputCls} autoFocus /></Field>
            {error && <p role="alert" className="text-sm font-semibold text-[#9b1c1c]">{error}</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
