"use client";

import { useEffect, useMemo, useState } from "react";
import Modal, { Field } from "@/components/master/Modal";
import { btnGhost, btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";
import { dayShort, hm } from "@/lib/ui";

export type DropPerson = { id: string; name: string; can: string[]; ministryIds: string[] };
export type DropPerms = { addSeat: boolean; override: boolean; scope: string[] | null };

type Seat = { id: string; ministryId: string; ministryName: string; teamTypeId: string; label: string; person: { id: string; name: string } | null };
type EventDetail = { id: string; title: string; startsAt: string; status: string; seats: Seat[] };
type Team = { id: string; name: string; ministries: { id: string; name: string; teamTypeId: string }[] };
type Mode = "replace" | "add" | null;
type Clash = { label: string; startsAt: string; endsAt: string; sameEvent?: boolean };
type Failure = { message: string; canOverride: boolean; conflict?: boolean; clashes?: Clash[] };

/**
 * Dialog setelah orang "belum dijadwalkan" di-drop ke sebuah acara:
 * pilih posisi (bawaan = pelayanannya sendiri), lalu bila posisi itu sudah terisi → gantikan atau tambah kursi.
 */
export default function AssignDropDialog({ person, eventId, perms, onClose, onDone }: {
  person: DropPerson; eventId: string; perms: DropPerms; onClose: () => void; onDone: (message: string) => void;
}) {
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadErr, setLoadErr] = useState("");
  const [ministryId, setMinistryId] = useState("");
  const [mode, setMode] = useState<Mode>(null);
  const [replaceSeatId, setReplaceSeatId] = useState("");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<Failure | null>(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    let live = true;
    Promise.all([callApi("GET", `/api/v1/events/${eventId}`), callApi("GET", "/api/v1/teams")]).then(([e, t]) => {
      if (!live) return;
      if (!e.ok || !t.ok) { setLoadErr(errMsg(e.ok ? t.data : e.data)); return; }
      setDetail(e.data as EventDetail);
      setTeams((t.data.items as Team[]).map((x) => ({ id: x.id, name: x.name, ministries: x.ministries.map((m) => ({ id: m.id, name: m.name, teamTypeId: m.teamTypeId })) })));
    });
    return () => { live = false; };
  }, [eventId]);

  const seats = detail?.seats ?? [];
  const scoped = useMemo(() => teams.filter((t) => perms.scope === null || perms.scope.includes(t.id)), [teams, perms.scope]);
  const own = useMemo(() => scoped.flatMap((t) => t.ministries.filter((m) => person.ministryIds.includes(m.id)).map((m) => ({ ...m, team: t.name }))), [scoped, person.ministryIds]);
  const others = useMemo(() => scoped.map((t) => ({ team: t.name, items: t.ministries.filter((m) => !person.ministryIds.includes(m.id)) })).filter((g) => g.items.length > 0), [scoped, person.ministryIds]);

  const seatsOf = (mid: string) => seats.filter((s) => s.ministryId === mid);
  const status = (mid: string) => {
    const s = seatsOf(mid);
    const empty = s.filter((x) => !x.person).length;
    return s.length === 0 ? "belum ada kursi" : empty > 0 ? `${empty} kursi kosong` : "penuh";
  };

  // pilihan awal: pelayanannya sendiri yang masih punya kursi kosong → yang punya kursi → pelayanan pertamanya
  useEffect(() => {
    if (!detail || ministryId) return;
    const pick = own.find((m) => seatsOf(m.id).some((s) => !s.person)) ?? own.find((m) => seatsOf(m.id).length > 0) ?? own[0] ?? others[0]?.items[0];
    if (pick) setMinistryId(pick.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, own, others]);

  const mSeats = seatsOf(ministryId);
  const empty = mSeats.filter((s) => !s.person);
  const filled = mSeats.filter((s) => s.person);
  const ministryName = [...own, ...others.flatMap((g) => g.items)].find((m) => m.id === ministryId)?.name ?? "";
  const isOwn = person.ministryIds.includes(ministryId);

  // setiap ganti posisi, pilihan "gantikan / tambah" dimulai dari nol (kecuali bila tidak ada kursi sama sekali → hanya bisa tambah)
  useEffect(() => {
    setFail(null);
    setMode(mSeats.length === 0 ? "add" : null);
    setReplaceSeatId(filled[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ministryId, detail]);

  const needsChoice = !!ministryId && empty.length === 0;
  const canSubmit = !!ministryId && !busy && (empty.length > 0 || (mode === "replace" && !!replaceSeatId) || (mode === "add" && perms.addSeat));

  async function submit(ov?: { reason: string }) {
    if (!detail) return;
    setBusy(true); setFail(null);
    const base = `/api/v1/events/${eventId}`;
    const failWith = (data: { error?: { code?: string; details?: { canOverride?: boolean; conflicts?: Clash[] } } } | null) =>
      setFail({
        message: errMsg(data),
        canOverride: !!(data?.error?.details?.canOverride && perms.override),
        conflict: data?.error?.code === "PERSON_CONFLICT",
        clashes: data?.error?.details?.conflicts,
      });

    let seatId: string | null = null;
    let createdSeat: string | null = null;

    if (empty.length > 0) {
      // pastikan kursi kosong itu belum diambil orang lain sejak dialog dibuka
      const fresh = await callApi("GET", base);
      if (fresh.ok) {
        const f = fresh.data as EventDetail;
        const still = f.seats.find((s) => s.id === empty[0].id);
        if (!still || still.person) { setDetail(f); setFail({ message: "Kursi itu baru saja terisi. Pilihan diperbarui, silakan cek lagi.", canOverride: false }); setBusy(false); return; }
      }
      seatId = empty[0].id;
    } else if (mode === "replace") {
      seatId = replaceSeatId;
    } else if (mode === "add") {
      const before = new Set(seats.map((s) => s.id));
      const r = await callApi("POST", `${base}/seats`, { ministryId, count: 1 });
      if (!r.ok) { failWith(r.data); setBusy(false); return; }
      const added = (r.data.seats as Seat[]).find((s) => s.ministryId === ministryId && !before.has(s.id));
      if (!added) { setFail({ message: "Kursi baru tidak ditemukan. Muat ulang lalu coba lagi.", canOverride: false }); setBusy(false); return; }
      seatId = added.id; createdSeat = added.id;
    }
    if (!seatId) { setBusy(false); return; }

    const r = await callApi("PUT", `${base}/seats/${seatId}/person`, { personId: person.id, override: ov });
    if (!r.ok) {
      if (createdSeat) await callApi("DELETE", `${base}/seats/${createdSeat}`); // batalkan kursi yang baru ditambah
      failWith(r.data);
      setBusy(false);
      return;
    }
    const warn = (r.data?.warnings as string[] | undefined)?.join(" ");
    onDone(`${person.name} ditugaskan sebagai ${ministryName} di ${detail.title} (${dayShort(detail.startsAt)}).${warn ? ` ${warn}` : ""}`);
  }

  const radio = (on: boolean, disabled?: boolean) =>
    `flex cursor-pointer flex-col gap-2 rounded-xl border p-3.5 text-left ${on ? "border-[var(--primary)] bg-[var(--primary-soft)]/60" : "border-[var(--line)] bg-white hover:bg-[var(--bg)]"} ${disabled ? "cursor-not-allowed opacity-60" : ""}`;

  const already = seats.find((s) => s.person?.id === person.id);

  // Bentrok → popup tersendiri (menggantikan dialog sementara; pilihan di dialog tetap tersimpan saat kembali)
  if (fail?.conflict) {
    return (
      <Modal
        title="Jadwal bentrok"
        onClose={() => setFail(null)}
        footer={<button type="button" className={btnPrimary} onClick={() => setFail(null)}>Kembali & pilih lain</button>}
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-2xl border border-[#F0C9C9] bg-[#FFF5F5] p-4">
            <span className="grid size-9 flex-none place-items-center rounded-full bg-[#FBE4E4] text-lg font-extrabold text-[#9B1C1C]" aria-hidden="true">!</span>
            <div className="flex flex-col gap-1">
              <span className="text-[15px] font-extrabold text-[#9B1C1C]">{person.name} tidak bisa dijadwalkan di sini</span>
              <span className="text-sm font-medium text-[#3A3F58]">Orang ini sudah punya jadwal lain yang jamnya bertabrakan. Satu orang tidak boleh berada di dua tempat pada jam yang sama.</span>
            </div>
          </div>

          {fail.clashes && fail.clashes.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {fail.clashes.map((c, i) => (
                <li key={i} className="flex flex-col gap-0.5 rounded-xl border border-[var(--line)] px-4 py-3">
                  <span className="text-sm font-bold">{c.label}</span>
                  <span className="text-xs font-semibold text-[var(--ink-2)]">
                    {dayShort(c.startsAt)} · {hm(c.startsAt)}–{hm(c.endsAt)}{c.sameEvent ? " · acara yang sama" : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl bg-[var(--bg)] px-4 py-3 text-sm font-semibold">{fail.message}</p>
          )}

          {fail.canOverride && (
            <div className="flex flex-wrap items-end gap-3 border-t border-[var(--line)] pt-4">
              <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-[13px] font-bold">Tembus bentrok sebagai Superadmin — alasan wajib dicatat
                <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="min. 5 karakter" />
              </label>
              <button type="button" className="h-11 rounded-xl bg-[#B42318] px-5 text-sm font-bold text-white disabled:opacity-50" disabled={busy || reason.trim().length < 5} onClick={() => void submit({ reason: reason.trim() })}>
                {busy ? "Menyimpan…" : "Tembus bentrok"}
              </button>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={`Jadwalkan ${person.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose} disabled={busy}>Batal</button>
          <button type="button" className={btnPrimary} onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? "Menyimpan…" : mode === "replace" && empty.length === 0 ? "Gantikan" : mode === "add" && empty.length === 0 ? "Tambah kursi & jadwalkan" : "Jadwalkan"}
          </button>
        </>
      }
    >
      {loadErr ? (
        <p role="alert" className="rounded-xl bg-[#FBE4E4] px-4 py-3 text-sm font-semibold text-[#9B1C1C]">{loadErr}</p>
      ) : !detail ? (
        <p className="py-6 text-center text-sm font-semibold text-[var(--ink-2)]">Memuat…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="rounded-xl bg-[var(--bg)] px-4 py-3 text-sm font-semibold">
            <span className="font-extrabold">{detail.title}</span> · {dayShort(detail.startsAt)} · {hm(detail.startsAt)}
            {detail.status === "DRAFT" && <span className="whitespace-nowrap ml-2 rounded-full bg-[var(--gold-soft)] px-2 py-0.5 text-[11px] font-bold text-[#6F4304]">Draf</span>}
          </p>

          <Field label="Mengisi bagian apa?">
            <select className={inputCls} value={ministryId} onChange={(e) => setMinistryId(e.target.value)}>
              {own.length > 0 && (
                <optgroup label={`Pelayanan ${person.name.split(" ")[0]}`}>
                  {own.map((m) => <option key={m.id} value={m.id}>{m.name} — {status(m.id)}</option>)}
                </optgroup>
              )}
              {others.map((g) => (
                <optgroup key={g.team} label={`Posisi lain · ${g.team}`}>
                  {g.items.map((m) => <option key={m.id} value={m.id}>{m.name} — {status(m.id)}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>

          {already && (
            <p className="rounded-xl bg-[var(--gold-soft)] px-4 py-3 text-[13px] font-semibold text-[#6F4304]">
              {person.name} sudah bertugas di acara ini sebagai <b>{already.label}</b>. Menambahkannya lagi akan ditolak karena jamnya bentrok.
            </p>
          )}

          {ministryId && !isOwn && (
            <p className="rounded-xl bg-[var(--gold-soft)] px-4 py-3 text-[13px] font-semibold text-[#6F4304]">{person.name} belum tercatat bisa {ministryName}. Tetap bisa dijadwalkan.</p>
          )}

          {empty.length > 0 && (
            <p className="rounded-xl bg-[#E3F3E7] px-4 py-3 text-[13px] font-semibold text-[#1B6B34]">Akan mengisi kursi <b>{empty[0].label}</b> yang masih kosong.</p>
          )}

          {needsChoice && (
            <div className="flex flex-col gap-2.5">
              <p className="text-[13px] font-bold">
                {mSeats.length === 0 ? `Acara ini belum punya posisi ${ministryName}.` : `Semua kursi ${ministryName} sudah terisi. Mau bagaimana?`}
              </p>

              {filled.length > 0 && (
                <div className={radio(mode === "replace")} onClick={() => setMode("replace")} role="radio" aria-checked={mode === "replace"} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setMode("replace"); } }}>
                  <span className="flex items-center gap-2 text-sm font-extrabold">
                    <span className={`grid size-4 place-items-center rounded-full border-2 ${mode === "replace" ? "border-[var(--primary)]" : "border-[#B8BCD3]"}`}>{mode === "replace" && <span className="size-2 rounded-full bg-[var(--primary)]" />}</span>
                    Gantikan yang sudah ada
                  </span>
                  {mode === "replace" && (
                    <>
                      <select className={inputCls} value={replaceSeatId} onChange={(e) => setReplaceSeatId(e.target.value)} onClick={(e) => e.stopPropagation()} aria-label="Kursi yang diganti">
                        {filled.map((s) => <option key={s.id} value={s.id}>{s.label} — {s.person!.name}</option>)}
                      </select>
                      <span className="text-xs font-medium text-[var(--ink-2)]">{filled.find((s) => s.id === replaceSeatId)?.person?.name} akan dikosongkan dari kursi ini.</span>
                    </>
                  )}
                </div>
              )}

              <div className={radio(mode === "add", !perms.addSeat)} onClick={() => perms.addSeat && setMode("add")} role="radio" aria-checked={mode === "add"} aria-disabled={!perms.addSeat} tabIndex={perms.addSeat ? 0 : -1}
                onKeyDown={(e) => { if (perms.addSeat && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setMode("add"); } }}>
                <span className="flex items-center gap-2 text-sm font-extrabold">
                  <span className={`grid size-4 place-items-center rounded-full border-2 ${mode === "add" ? "border-[var(--primary)]" : "border-[#B8BCD3]"}`}>{mode === "add" && <span className="size-2 rounded-full bg-[var(--primary)]" />}</span>
                  Tambah kursi {ministryName} baru
                </span>
                <span className="text-xs font-medium text-[var(--ink-2)]">
                  {perms.addSeat ? "Kursi baru dibuat, lalu diisi orang ini. Yang sudah ada tidak berubah." : "Hanya Penjadwal yang bisa menambah kursi."}
                </span>
              </div>
            </div>
          )}

          {fail && (
            <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-[#F0C9C9] bg-[#FFF5F5] p-4">
              <span className="text-sm font-medium text-[#3A3F58]">{fail.message}</span>
              {fail.canOverride && (
                <div className="flex flex-wrap items-end gap-3 border-t border-[#F0C9C9] pt-3">
                  <label className="flex min-w-48 flex-1 flex-col gap-1.5 text-[13px] font-bold">Tembus bentrok sebagai Superadmin — alasan wajib dicatat
                    <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="min. 5 karakter" />
                  </label>
                  <button type="button" className="h-11 rounded-xl bg-[#B42318] px-5 text-sm font-bold text-white disabled:opacity-50" disabled={busy || reason.trim().length < 5} onClick={() => void submit({ reason: reason.trim() })}>Tembus bentrok</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
