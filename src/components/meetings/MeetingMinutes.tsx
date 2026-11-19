"use client";

import Fab from "@/components/ui/Fab";
import Link from "next/link";
import { askConfirm } from "@/components/ui/Confirm";
import { showToast } from "@/components/ui/Toast";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal, { Field } from "@/components/master/Modal";
import Pager from "@/components/ui/Pager";
import { useClientPaging } from "@/components/ui/usePagedList";
import { btnGhost, btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";
import { dayLong, hm } from "@/lib/ui";
import type { MeetingDto } from "./MeetingDetail";
import { STATUS } from "./MeetingAttendance";
import ShareNotulen from "./ShareNotulen";
import type { getMinutes } from "@/lib/meetingMinutes";

type MinutesDto = Awaited<ReturnType<typeof getMinutes>>;
type Content = { agenda: string; discussion: string; decisions: string };

const eyebrow = "text-xs font-extrabold tracking-[0.07em] text-[var(--gold-ink)]";
const card = "flex flex-col gap-3 rounded-[20px] border border-[var(--line)] bg-white p-[22px]";
const stamp = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const host = (u: string) => { try { return new URL(u).hostname; } catch { return u; } };
const area = "w-full resize-y rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 text-[14.5px] font-medium leading-relaxed text-[var(--ink)] focus:outline-2 focus:outline-offset-2 focus:outline-[var(--primary)]";

function Rule({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2.5"><span className={eyebrow}>{children}</span><span className="h-px flex-1 bg-[#e8e4d6]" /></div>;
}

function ReadText({ value }: { value: string }) {
  return value.trim()
    ? <p className="m-0 whitespace-pre-wrap text-[14.5px] font-medium leading-[1.7]">{value}</p>
    : <p className="m-0 text-sm font-medium italic text-[var(--ink-2)]">Belum diisi.</p>;
}

const SECTIONS: { key: keyof Content; title: string; rows: number; hint?: string }[] = [
  { key: "agenda", title: "AGENDA", rows: 4, hint: "Satu agenda per baris, mis. “1. Evaluasi pelayanan Oktober”." },
  { key: "discussion", title: "PEMBAHASAN DAN TINDAK LANJUT", rows: 10, hint: "Tulis tindak lanjut di sini juga: siapa, apa, dan batas waktunya." },
  { key: "decisions", title: "KEPUTUSAN", rows: 4, hint: "Satu keputusan per baris." },
];

export default function MeetingMinutes({ meeting: m, minutes, churchName }: { meeting: MeetingDto; minutes: MinutesDto; churchName: string }) {
  const router = useRouter();
  const { status, viewer } = minutes;
  const canEdit = viewer.canWrite && status !== "FINAL";
  const [draft, setDraft] = useState<Content>(minutes.content);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [reviseOpen, setReviseOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [viewVersion, setViewVersion] = useState<number | null>(null);

  const serverKey = `${status}-${minutes.version}-${minutes.updatedAt}-${minutes.showingFinal}`;
  useEffect(() => { setDraft(minutes.content); }, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = canEdit && (draft.agenda !== minutes.content.agenda || draft.discussion !== minutes.content.discussion || draft.decisions !== minutes.content.decisions);
  const empty = !`${draft.agenda}${draft.discussion}${draft.decisions}`.trim();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const run = async (fn: () => Promise<{ ok: boolean; data: unknown }>, okMsg?: string) => {
    setBusy(true); setError(""); setSaved("");
    const r = await fn();
    setBusy(false);
    if (r.ok) { if (okMsg) { setSaved(okMsg); showToast(okMsg); } router.refresh(); } else { setError(errMsg(r.data)); showToast("Notulen belum tersimpan", "error"); }
    return r.ok;
  };
  const save = () => run(() => callApi("PUT", `/api/v1/meetings/${m.id}/minutes`, draft), "Draf notulen berhasil disimpan.");
  const finalize = async () => {
    if (!(await askConfirm("Finalkan notulen ini? Setelah Final isinya terkunci; perubahan berikutnya dibuat sebagai revisi baru dan tercatat di riwayat.", { confirmLabel: "Finalkan" }))) return;
    await run(() => callApi("POST", `/api/v1/meetings/${m.id}/minutes/finalize`, { content: draft }), "Notulen berhasil difinalkan.");
  };
  const revise = async () => { if (await run(() => callApi("POST", `/api/v1/meetings/${m.id}/minutes/revise`, { reason: reason.trim() || undefined }))) { setReviseOpen(false); setReason(""); } };

  // status dan banner
  const chip = status === "FINAL" ? { t: `Final · versi ${minutes.version}`, bg: "#E3F3E7", fg: "#1B6B34" }
    : status === "DRAFT" ? { t: minutes.revising ? `Revisi · versi ${minutes.version} (draf)` : "Draf", bg: "#FBEFD6", fg: "#6F4304" }
    : { t: "Belum dibuat", bg: "#ECEEF4", fg: "#565B76" };
  const banner = minutes.meetingCancelled ? { t: "Rapat ini dibatalkan, notulen tidak bisa diubah.", bg: "#FDF1F1", bd: "#F0C7C7", fg: "#9B1C1C" }
    : minutes.showingFinal ? { t: `Revisi sedang disusun. Anda melihat versi Final terakhir (versi ${minutes.lastFinalVersion}).`, bg: "#FFFBF0", bd: "#EAD9AE", fg: "#6F4304" }
    : status === "FINAL" ? { t: "Notulen sudah Final dan terkunci. Perubahan berikutnya dibuat sebagai revisi baru dan tercatat di riwayat.", bg: "#E3F3E7", bd: "#BFE0C7", fg: "#1B6B34" }
    : status === "DRAFT" ? { t: `${minutes.revising ? `Revisi versi ${minutes.version} masih draf${minutes.reviseReason ? ` (alasan: ${minutes.reviseReason})` : ""}.` : "Masih draf."} Tulis, simpan, lalu ${viewer.canFinalize ? "finalkan" : "minta yang berwenang memfinalkan"}. Hanya terlihat oleh anggota ${m.group.name}.`, bg: "#FFFBF0", bd: "#EAD9AE", fg: "#6F4304" }
    : viewer.canWrite ? { t: "Belum ada notulen. Isi lalu simpan sebagai draf. Hanya terlihat oleh anggota " + m.group.name + ".", bg: "#F1F2FD", bd: "#D5D8F2", fg: "#2A2F8F" }
    : { t: "Notulen rapat ini belum dibuat.", bg: "#F1F2FD", bd: "#D5D8F2", fg: "#2A2F8F" };

  // gambar untuk WhatsApp selalu memakai versi Final terbaru
  const lastFinal = minutes.revisions[0] ?? null;
  const shareData = lastFinal ? (() => {
    const members = m.participants.filter((p) => !p.isGuest);
    const names = (st: string) => members.filter((p) => p.status === st).map((p) => p.name);
    const a = m.attendance;
    return {
      church: churchName, group: m.group.name, topic: m.title ?? m.displayTitle, dateText: dayLong(m.startsAt), timeText: `${hm(m.startsAt)}–${hm(m.endsAt)} WIB`, room: m.room.name, number: m.number,
      version: lastFinal.version,
      attendanceSummary: a ? `${a.present} dari ${a.invited} anggota hadir (${a.percent}%)${a.quorumMin != null && a.quorumMet != null ? (a.quorumMet ? `, kuorum ${a.quorumMin}% terpenuhi` : `, belum memenuhi kuorum ${a.quorumMin}%`) : ""}` : null,
      present: names("PRESENT"), excused: names("EXCUSED"), absent: names("ABSENT"), guests: m.participants.filter((p) => p.isGuest).map((p) => p.name),
      agenda: lastFinal.agenda, discussion: lastFinal.discussion, decisions: lastFinal.decisions,
      finalizedText: `Difinalkan${lastFinal.finalizedBy ? ` oleh ${lastFinal.finalizedBy}` : ""} pada ${stamp(lastFinal.finalizedAt)} WIB.`,
    };
  })() : null;

  const viewing = viewVersion !== null ? minutes.revisions.find((r) => r.version === viewVersion) ?? null : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2.5">
          <Link href={`/rapat/${m.id}`} className="text-[13px] font-bold text-[var(--primary-ink)] hover:underline">← Kembali ke rapat</Link>
          <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold text-[var(--ink-2)]">
            <span className="rounded-lg bg-[#f8e6dd] px-3 py-[3px] text-[#7a3a1e]">Rapat {m.group.name}</span>
            <span>{dayLong(m.startsAt)} · {hm(m.startsAt)}–{hm(m.endsAt)} · {m.room.name}</span>
          </span>
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] font-extrabold" style={{ background: chip.bg, color: chip.fg }}>{chip.t}</span>
            <span className="flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--ink-2)]">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
              Tertutup, hanya untuk anggota {m.group.name}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {shareData && !dirty && <ShareNotulen data={shareData} dateIso={m.startsAt} />}
          {minutes.revisions.length > 0 && !dirty && (
            <a href={`/rapat/${m.id}/notulen/cetak`} target="_blank" rel="noopener noreferrer" className={`${btnGhost} flex !h-[46px] items-center gap-2 !px-[18px] max-md:hidden`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v6H7z" /></svg>
              Cetak / simpan PDF
            </a>
          )}
          {canEdit && <button type="button" onClick={save} disabled={busy || !dirty} className={`${btnGhost} !h-[46px] !px-[18px] max-md:hidden`}>{busy ? "Menyimpan…" : "Simpan draf"}</button>}
          {canEdit && viewer.canFinalize && <button type="button" onClick={finalize} disabled={busy || empty} className={`${btnPrimary} !h-[46px] !px-[22px] max-md:hidden`}>Finalkan notulen</button>}
          {status === "FINAL" && viewer.canFinalize && <button type="button" onClick={() => setReviseOpen(true)} disabled={busy} className={`${btnGhost} !h-[46px] !px-[22px] max-md:hidden`}>Buat revisi</button>}
        </div>
      </div>

      <Fab dot={canEdit && dirty} quick={canEdit && dirty ? "save" : undefined} actions={[
        ...(canEdit ? [{ key: "save", label: busy ? "Menyimpan…" : "Simpan draf", icon: "save" as const, tone: "primary" as const, disabled: busy || !dirty, busy, onClick: save }] : []),
        ...(canEdit && viewer.canFinalize ? [{ key: "final", label: "Finalkan notulen", icon: "publish" as const, tone: "gold" as const, disabled: busy || empty, onClick: finalize }] : []),
        ...(minutes.revisions.length > 0 && !dirty ? [{ key: "print", label: "Cetak / simpan PDF", icon: "print" as const, tone: "neutral" as const, onClick: () => { window.open(`/rapat/${m.id}/notulen/cetak`, "_blank", "noopener,noreferrer"); } }] : []),
        ...(status === "FINAL" && viewer.canFinalize ? [{ key: "revise", label: "Buat revisi", icon: "edit" as const, tone: "neutral" as const, disabled: busy, onClick: () => setReviseOpen(true) }] : []),
      ]} />

      <div role="status" className="rounded-[14px] border px-4 py-3 text-[13.5px] font-semibold leading-relaxed" style={{ background: banner.bg, borderColor: banner.bd, color: banner.fg }}>{banner.t}</div>
      {dirty && <p className="-mt-3 text-[12.5px] font-bold text-[#6f4304]">Ada perubahan yang belum disimpan.</p>}
      {saved && !dirty && <p role="status" className="-mt-3 text-[12.5px] font-bold text-[#1b6b34]">{saved}</p>}
      {error && <p role="alert" className="rounded-xl border border-[#f0c7c7] bg-[#fdf1f1] px-4 py-3 text-sm font-semibold text-[#9b1c1c]">{error}</p>}

      <div className="flex flex-wrap items-start gap-5">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-5">
          {SECTIONS.map((s) => (
            <div key={s.key} className={card}>
              <Rule>{s.title}</Rule>
              {canEdit ? (
                <>
                  <textarea aria-label={s.title} rows={s.rows} maxLength={20000} value={draft[s.key]} onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })} className={area} />
                  {s.hint && <span className="text-xs font-medium text-[var(--ink-2)]">{s.hint}</span>}
                </>
              ) : (
                <ReadText value={minutes.content[s.key]} />
              )}
            </div>
          ))}
        </section>

        <aside className="flex min-w-[300px] max-md:min-w-0 max-w-[400px] flex-[1_1_320px] flex-col gap-5">
          <AttendanceSide m={m} />

          <div className={card}>
            <Rule>LAMPIRAN</Rule>
            {m.links.length === 0 && <span className="text-sm font-medium text-[var(--ink-2)]">Belum ada tautan.</span>}
            {m.links.map((l) => (
              <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-0.5 rounded-xl border border-[var(--line)] px-3 py-2.5 hover:bg-[#f6f7fe]">
                <span className="truncate text-sm font-bold">{l.title}</span><span className="truncate text-[12.5px] font-medium text-[var(--ink-2)]">{host(l.url)}</span>
              </a>
            ))}
            {m.viewer.canAttach && <Link href={`/rapat/${m.id}`} className="self-start text-[13px] font-bold text-[var(--primary-ink)] hover:underline">Kelola lampiran →</Link>}
          </div>

          <div className={card}>
            <Rule>RIWAYAT</Rule>
            {minutes.history.length === 0 && <span className="text-sm font-medium text-[var(--ink-2)]">Belum ada riwayat.</span>}
            {minutes.history.map((h) => (
              <div key={h.key} className="flex items-start gap-3">
                <span className="mt-[5px] size-[9px] flex-none rounded-full" style={{ background: h.kind === "FINAL" ? "#1B6B34" : "#6B7090" }} aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="text-[13.5px] font-bold">{h.title}</span>
                  <span className="text-[12.5px] font-medium text-[var(--ink-2)]">{[h.by, stamp(h.at)].filter(Boolean).join(" · ")}</span>
                  {h.reason && <span className="text-[12.5px] font-medium text-[var(--ink-2)]">Alasan revisi: {h.reason}</span>}
                </span>
                {h.kind === "FINAL" && <button type="button" onClick={() => setViewVersion(h.version)} className="h-8 rounded-lg px-2.5 text-[12.5px] font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Lihat</button>}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {reviseOpen && (
        <Modal title="Buat revisi notulen" onClose={() => setReviseOpen(false)}
          footer={<>
            <button type="button" onClick={() => setReviseOpen(false)} className={btnGhost}>Batal</button>
            <button type="button" onClick={revise} disabled={busy} className={btnPrimary}>{busy ? "Membuka…" : "Buat revisi"}</button>
          </>}>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium leading-relaxed text-[var(--ink-2)]">Versi {minutes.version} tetap tersimpan di riwayat. Revisi menjadi versi {minutes.version + 1} berstatus draf, dan harus difinalkan lagi. Anggota yang tidak menulis tetap melihat versi {minutes.version} sampai revisi difinalkan.</p>
            <Field label="Alasan revisi (tidak wajib)"><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Mis. Koreksi nama dan tenggat tindak lanjut" className={inputCls} autoFocus /></Field>
            {error && <p role="alert" className="text-sm font-semibold text-[#9b1c1c]">{error}</p>}
          </div>
        </Modal>
      )}

      {viewing && (
        <Modal title={`Versi ${viewing.version} · Final`} onClose={() => setViewVersion(null)} wide footer={<><a href={`/rapat/${m.id}/notulen/cetak?v=${viewing.version}`} target="_blank" rel="noopener noreferrer" className={`${btnGhost} flex items-center`}>Cetak versi ini</a><button type="button" onClick={() => setViewVersion(null)} className={btnGhost}>Tutup</button></>}>
          <div className="flex flex-col gap-4">
            <p className="text-[13px] font-semibold text-[var(--ink-2)]">Difinalkan {[viewing.finalizedBy, stamp(viewing.finalizedAt)].filter(Boolean).join(" · ")}{viewing.reason ? ` · Alasan revisi: ${viewing.reason}` : ""}</p>
            {SECTIONS.map((s) => (
              <div key={s.key} className="flex flex-col gap-2"><span className={eyebrow}>{s.title}</span><ReadText value={viewing[s.key]} /></div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Ringkasan kehadiran di samping notulen (hanya baca; mencatat kehadiran dilakukan di halaman rapat). */
function AttendanceSide({ m }: { m: MeetingDto }) {
  const a = m.attendance;
  const paging = useClientPaging(m.participants);
  const tone = useMemo(() => (a?.quorumMet === false ? { bg: "#FBF0D9", fg: "#6F4304" } : { bg: "#E3F3E7", fg: "#1B6B34" }), [a?.quorumMet]);
  return (
    <div className={card}>
      <Rule>KEHADIRAN</Rule>
      {m.participants.length === 0 || !a ? (
        <span className="text-sm font-medium text-[var(--ink-2)]">Belum ada peserta yang diundang.</span>
      ) : (
        <>
          <div className="flex flex-col gap-1.5 rounded-xl px-3.5 py-3" style={{ background: tone.bg, color: tone.fg }}>
            <span className="text-[15px] font-extrabold">{a.present} dari {a.invited} anggota hadir ({a.percent}%)</span>
            {a.quorumMin != null && a.quorumMet != null && (
              <span className="text-[12.5px] font-semibold">{a.quorumMet ? `Kuorum ${a.quorumMin}% terpenuhi · rapat sah` : `Belum memenuhi kuorum ${a.quorumMin}%`}</span>
            )}
          </div>
          <div className="flex flex-col">
            {paging.slice.map((p) => {
              const st = STATUS[p.status] ?? STATUS.INVITED;
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 border-b border-[var(--line-2)] py-2 text-sm last:border-b-0">
                  <span className="flex min-w-0 items-center gap-2 font-bold"><span className="truncate">{p.name}</span>{p.isGuest && <span className="whitespace-nowrap rounded-full bg-[#fbf0d9] px-2 py-0.5 text-[11px] font-extrabold text-[#6f4304]">Tamu</span>}</span>
                  <span className="whitespace-nowrap flex-none rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                </div>
              );
            })}
          </div>
          <Pager page={paging.page} pageSize={paging.pageSize} total={paging.total} onPage={paging.setPage} onPageSize={paging.setPageSize} noun="peserta" className="!px-0" />
        </>
      )}
      {m.viewer.canRecord && <Link href={`/rapat/${m.id}`} className="self-start text-[13px] font-bold text-[var(--primary-ink)] hover:underline">Catat kehadiran dan undangan →</Link>}
    </div>
  );
}
