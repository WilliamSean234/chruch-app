"use client";

import Fab from "@/components/ui/Fab";
import Link from "next/link";
import { askConfirm } from "@/components/ui/Confirm";
import { showToast } from "@/components/ui/Toast";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { stickyPage } from "@/components/ui/sticky";
import Switch from "./Switch";
import SeatPicker from "./SeatPicker";
import { addToTime, btnGhost, btnPrimary, callApi, card, diffMin, errMsg, hmInput, inputCls } from "./api";
import { dayLong, dayShort, hm, initials, MONTHS, STATUS_LABEL, toneFor, WEEKDAYS, ymd } from "@/lib/ui";
import RoomOptions from "@/components/ui/RoomOptions";
import NotifyStaff from "./NotifyStaff";
import OnlineFields from "@/components/online/OnlineFields";
import { emptyOnline, onlineBody, onlineFromDto, onlineProblem, type OnlineValue } from "@/lib/onlineForm";

type Seat = {
  id: string; teamTypeId: string; ministryId: string; ministryName: string; slotNo: number; label: string; rehearsalRequired: boolean; bandOnly?: boolean;
  person: { id: string; name: string; origin: string; originChurch: string | null } | null;
};
type Detail = {
  createdBy: string | null; createdAt: string;
  id: string; number: string; title: string; status: string; attendanceMode: string; theme: string | null; padus: string | null; bandMode: "BAND" | "NO_BAND"; locked?: boolean; attendanceOpen?: boolean; attendance?: { mode: "COUNT" | "NAMES"; total: number; note: string | null; recordedAt: string | null } | null; startsAt: string; endsAt: string; durationMin: number;
  room: { id: string; name: string }; teams: { teamTypeId: string; name: string }[]; seats: Seat[];
  isOnline?: boolean;
  online?: { isOnline: boolean; url: string | null; canSeeLink: boolean; speaker: { personId: string | null; name: string } | null; communities: { id: string; name: string }[]; visibleTo: string } | null;
  /** Ibadah pasangan di hari yang sama (Minggu 1 dan 2): personelnya biasanya sama. */
  pair: { id: string; number: string; title: string; startsAt: string; filled: number; sessions: number; seats: { ministryId: string; slotNo: number; personId: string | null }[] } | null;
};
/** "2026-12-20", 3 → "2026-12-17" */
const daysBefore = (ymdText: string, n: number) => {
  const [y, m, dd] = ymdText.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, dd! - n)).toISOString().slice(0, 10);
};
type Reh = { sessions: { id: string; seq: number; startsAt: string; endsAt: string; room: { id: string; name: string }; note: string | null; shared?: boolean }[]; participants: { assignmentId: string; rehearsalRequired: boolean }[] };
type TeamFull = { id: string; name: string; ministries: { id: string; name: string }[] };
type Room = { id: string; name: string; floor?: number | null; isActive: boolean };
type Banner = { kind: "error" | "info"; title: string; message: string; override?: (reason: string) => Promise<void> };

export type Perms = { editEvent: boolean; assign: boolean; rehearsal: boolean; publish: boolean; override: boolean; addPerson: boolean; scope: string[] | null };

export default function EventEditor({ eventId, perms }: { eventId: string; perms: Perms }) {
  const [d, setD] = useState<Detail | null>(null);
  const [reh, setReh] = useState<Reh | null>(null);
  const [teams, setTeams] = useState<TeamFull[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<string | null>(null);
  const [addSeatTeam, setAddSeatTeam] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [saved, setSaved] = useState(false); // popup "berhasil disimpan"
  const [tab, setTab] = useState("info"); // HP: "info" | "team:<id>" | "latihan" (desktop menampilkan semuanya)
  const topRef = useRef<HTMLDivElement>(null);
  const [cancelReason, setCancelReason] = useState("");
  // form info
  const [f, setF] = useState<{ title: string; date: string; start: string; end: string; roomId: string; mode: string; theme: string; padus: string; onl: OnlineValue }>({ title: "", date: "", start: "", end: "", roomId: "", mode: "COUNT", theme: "", padus: "", onl: emptyOnline });
  const [bandAsk, setBandAsk] = useState(false); // konfirmasi (tanpa popup bawaan browser) sebelum ke No Band bila ada orang di posisi band
  const [base, setBase] = useState(f); // isi form terakhir dari server, untuk mengetahui ada perubahan atau tidak
  // form latihan
  const [rf, setRf] = useState<{ open: boolean; editId: string | null; date: string; start: string; dur: number; roomId: string; note: string }>({ open: false, editId: null, date: "", start: "19:00", dur: 120, roomId: "", note: "" });

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([callApi("GET", `/api/v1/events/${eventId}`), callApi("GET", `/api/v1/events/${eventId}/rehearsals`)]);
    if (!a.ok) { setBanner({ kind: "error", title: "Gagal memuat", message: errMsg(a.data) }); return; }
    const det = a.data as Detail;
    setD(det);
    if (b.ok) setReh(b.data);
    const form = { title: det.title, date: ymd(det.startsAt), start: hmInput(det.startsAt), end: hmInput(det.endsAt), roomId: det.isOnline ? "" : det.room.id, mode: det.attendanceMode, theme: det.theme ?? "", padus: det.padus ?? "", onl: onlineFromDto(det.online) };
    setF(form); setBase(form);
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    callApi("GET", "/api/v1/teams").then((r) => r.ok && setTeams(r.data.items));
    callApi("GET", "/api/v1/lookups/rooms").then((r) => r.ok && setRooms(r.data.items));
  }, []);

  // HP: tab yang aktif ikut tergeser ke tengah baris tab, dan halaman kembali ke awal konten bila sudah tergulir jauh
  useEffect(() => {
    document.getElementById(`etab-${tab}`)?.scrollIntoView({ inline: "center", block: "nearest" });
    const top = topRef.current;
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start" });
  }, [tab]);

  const editable = !!d && d.status !== "CANCELLED" && !d.locked;
  const infoDirty = JSON.stringify(f) !== JSON.stringify(base);
  const seatEditable = (s: Seat) => editable && perms.assign && (perms.scope === null || perms.scope.includes(s.teamTypeId));

  /** Jalankan aksi; tampilkan pesan bila gagal. `override` dipakai bila Superadmin boleh menembus bentrok. */
  async function run(fn: () => Promise<{ ok: boolean; status: number; data: any }>, onOk?: (data: any) => void, retry?: (reason: string) => Promise<void>): Promise<boolean> {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (r.ok) {
      setBanner(r.data?.warnings?.length ? { kind: "info", title: "Catatan", message: r.data.warnings.join(" ") } : null);
      onOk?.(r.data);
      await load();
      return true;
    }
    const code = r.data?.error?.code as string | undefined;
    const canOv = r.data?.error?.details?.canOverride && perms.override && retry;
    setBanner({
      kind: "error",
      title: code === "PERSON_CONFLICT" || code === "REHEARSAL_CONFLICT" || code === "SEAT_RULE" ? "Tidak bisa dijadwalkan" : "Gagal",
      message: errMsg(r.data),
      override: canOv ? retry : undefined,
    });
    setOverrideReason("");
    return false;
  }

  // ───────── info acara
  const saveInfo = async () => {
    if (!d) return;
    const dur = diffMin(f.start, f.end);
    if (dur <= 0) return setBanner({ kind: "error", title: "Waktu tidak valid", message: "Jam selesai harus setelah jam mulai." });
    const problem = onlineProblem(f.onl, "IBADAH") ?? (!f.onl.online && !f.roomId ? "Pilih ruangan." : null);
    if (problem) return setBanner({ kind: "error", title: "Belum lengkap", message: problem });
    // tema dan padus biasanya sama untuk kedua ibadah: tanyakan apakah ikut disimpan di ibadah satunya
    const sharedChanged = f.theme !== base.theme || f.padus !== base.padus;
    const alsoPair = !!d.pair && sharedChanged && (await askPair(`Tema atau catatan padus diubah. Simpan juga di ${d.pair.title}? Judul, jam, dan ruangan tidak ikut diubah.`));
    return run(() => callApi("PATCH", `/api/v1/events/${eventId}`, { title: f.title, date: f.date, startTime: f.start, durationMin: dur, ...(f.onl.online ? {} : { roomId: f.roomId }), ...onlineBody(f.onl, "IBADAH"), attendanceMode: f.mode, theme: f.theme, padus: f.padus, alsoPair }), () => setSaved(true));
  };

  /** Pilihan untuk Ibadah Minggu 1 dan 2: true = berlaku di kedua ibadah, false = hanya ibadah ini (juga bila ditutup dengan Esc). */
  const askPair = (message: string) => askConfirm(message, { title: "Ibadah Minggu pasangan", confirmLabel: "Kedua ibadah", cancelLabel: "Hanya ini" });

  // ───────── status
  const changeStatus = async (action: "publish" | "reopen" | "unpublish", ask: string, confirmLabel: string, done: string) => {
    if (!(await askConfirm(ask, { confirmLabel }))) return;
    if (await run(() => callApi("POST", `/api/v1/events/${eventId}/${action}`))) showToast(done);
  };
  const publish = () => changeStatus("publish", "Terbitkan jadwal ini? Status acara menjadi terbit.", "Terbitkan", "Jadwal diterbitkan");
  const reopen = () => changeStatus("reopen", "Aktifkan kembali acara ini? Acara yang tadinya dibatalkan menjadi aktif lagi.", "Aktifkan", "Acara diaktifkan kembali");
  const unpublish = () => changeStatus("unpublish", "Tarik jadwal ini ke draf? Status acara kembali menjadi draf.", "Tarik ke draf", "Jadwal ditarik ke draf");
  const cancel = () => run(() => callApi("POST", `/api/v1/events/${eventId}/cancel`, { reason: cancelReason }), () => { setCancelOpen(false); setCancelReason(""); });

  // ───────── kursi & orang
  const assign = (seatId: string, personId: string | null, ov?: { reason: string }, mirror = false): Promise<boolean> =>
    run(() => callApi("PUT", `/api/v1/events/${eventId}/seats/${seatId}/person`, { personId, override: ov, mirror }), () => setPicker(null), personId ? (reason) => assign(seatId, personId, { reason }, mirror).then(() => undefined) : undefined);

  /** Isi, ganti, atau kosongkan satu kursi. Mengganti atau mengosongkan orang yang sudah ada meminta konfirmasi dulu. */
  async function assignSeat(s: Seat, personId: string | null): Promise<boolean> {
    if (s.person) {
      const clearing = personId === null;
      const q = clearing ? `Kosongkan ${s.label}? ${s.person.name} dilepas dari posisi ini.` : `Ganti ${s.person.name} di ${s.label}? Orang yang dipilih akan menggantikannya.`;
      if (!(await askConfirm(q, { danger: clearing, confirmLabel: clearing ? "Kosongkan" : "Ganti" }))) { setPicker(null); return false; }
    }
    // kursi yang sama di ibadah pasangan masih sama dengan sebelum diubah: tanyakan apakah ikut diubah
    const twin = d?.pair?.seats.find((x) => x.ministryId === s.ministryId && x.slotNo === s.slotNo);
    let mirror = false;
    if (d?.pair && twin && twin.personId === (s.person?.id ?? null) && (personId ?? null) !== (s.person?.id ?? null)) {
      const what = personId === null ? `Kosongkan ${s.label} juga di ${d.pair.title}?` : `Isi ${s.label} yang sama juga di ${d.pair.title}?`;
      setPicker(null);
      mirror = await askPair(what);
    }
    const ok = await assign(s.id, personId, undefined, mirror);
    if (ok) showToast(personId === null ? `${s.label} dikosongkan` : `${s.label} diperbarui`);
    return ok;
  }

  const setRequired = (seatId: string, required: boolean) =>
    run(() => callApi("PUT", `/api/v1/events/${eventId}/seats/${seatId}/rehearsal`, { required }), undefined, (reason) => setRequiredOv(seatId, required, reason));
  const setRequiredOv = async (seatId: string, required: boolean, reason: string) => { await run(() => callApi("PUT", `/api/v1/events/${eventId}/seats/${seatId}/rehearsal`, { required, override: { reason } })); };

  async function bulkRequired(teamTypeId: string, required: boolean, teamName: string) {
    const q = required ? `Wajibkan latihan untuk semua posisi ${teamName}? Perubahan langsung tersimpan.` : `Hapus kewajiban latihan untuk semua posisi ${teamName}? Perubahan langsung tersimpan.`;
    if (!(await askConfirm(q, { danger: false, confirmLabel: required ? "Wajibkan" : "Hapus kewajiban" }))) return;
    setBusy(true);
    const r = await callApi("PUT", `/api/v1/events/${eventId}/rehearsal-required`, { required, teamTypeId });
    setBusy(false);
    if (!r.ok) return setBanner({ kind: "error", title: "Gagal", message: errMsg(r.data) });
    const blocked = r.data.blocked as { label: string; person: string | null; reason: string }[];
    setBanner(blocked.length ? { kind: "info", title: `${blocked.length} kursi tidak diubah karena bentrok`, message: blocked.map((b) => `${b.label}${b.person ? ` (${b.person})` : ""}: ${b.reason}`).join(" ") } : null);
    showToast(required ? `Latihan diwajibkan untuk semua posisi ${teamName}` : `Kewajiban latihan dihapus untuk semua posisi ${teamName}`);
    await load();
  }

  /** Isi kursi kosong dengan personel ibadah pasangannya. Kursi yang sudah terisi tidak diubah. */
  async function copyFromPair() {
    if (!d?.pair) return;
    const from = d.pair;
    if (!(await askConfirm(`Isi kursi yang masih kosong di acara ini dengan personel dari ${from.title}, dan tambahkan sesi latihan yang belum ada (jam dan ruangan sama)? Kursi yang sudah terisi tidak diubah, dan tiap kursi tetap bisa diubah satu per satu.`))) return;
    setBusy(true);
    const r = await callApi("POST", `/api/v1/events/${eventId}/copy-personnel`, { sourceEventId: from.id });
    setBusy(false);
    if (!r.ok) return setBanner({ kind: "error", title: "Gagal menyalin", message: errMsg(r.data) });
    const skipped = r.data.skipped as { label: string; person: string; reason: string }[];
    const notes = r.data.notes as string[];
    const reh = r.data.rehearsals as { added: number; skipped: string[]; required: number };
    const lines = [...skipped.map((x) => `${x.label} (${x.person}): ${x.reason}`), ...notes, ...reh.skipped];
    const parts = [
      r.data.filled > 0 ? `${r.data.filled} kursi terisi` : "",
      reh.added > 0 ? `${reh.added} sesi latihan ditambahkan` : "",
    ].filter(Boolean);
    setBanner({
      kind: "info",
      title: parts.length === 0 && skipped.length === 0 && reh.skipped.length === 0 ? "Tidak ada yang perlu disalin" : `${parts.join(", ") || "Tidak ada yang disalin"} dari ${from.title}${skipped.length + reh.skipped.length ? `, ${skipped.length + reh.skipped.length} dilewati` : ""}`,
      message: lines.length ? lines.join(" ") : "Selesai. Kursi yang sudah terisi tidak diubah.",
    });
    await load();
  }

  const removeSeat = async (seatId: string, label: string) => { if (await askConfirm(`Hapus posisi ${label} dari acara ini?`)) void run(() => callApi("DELETE", `/api/v1/events/${eventId}/seats/${seatId}`)); };
  const setBand = async (bandMode: "BAND" | "NO_BAND") => {
    setBandAsk(false);
    const label = bandMode === "NO_BAND" ? "No Band" : "Band";
    const alsoPair = !!d?.pair && (await askPair(`Ubah ke ${label} juga untuk ${d.pair.title}?`));
    return run(() => callApi("POST", `/api/v1/events/${eventId}/band-mode`, { bandMode, alsoPair }), (r) => {
      const gone: string[] = r?.released ?? [];
      const own = bandMode === "NO_BAND"
        ? `${r?.removed ?? 0} posisi band dihapus dari acara.${gone.length ? ` Orang yang dilepas: ${gone.join(", ")}.` : ""}`
        : (r?.restored ?? 0) > 0 ? `${r.restored} posisi band dikembalikan sesuai template.` : "Tidak ada posisi band yang perlu dikembalikan. Tambahkan lewat tombol tambah posisi bila perlu.";
      setBanner({ kind: "info", title: bandMode === "NO_BAND" ? "Diubah ke No Band" : "Diubah ke Band", message: r?.pairNote ? `${own} ${r.pairNote}` : own });
    });
  };
  const addSeat = (ministryId: string, count: number) => run(() => callApi("POST", `/api/v1/events/${eventId}/seats`, { ministryId, count }), () => setAddSeatTeam(null));
  const addNewSeat = async (teamTypeId: string, name: string, required: boolean, count: number) => {
    const known = teams.find((t) => t.id === teamTypeId)?.ministries.find((m) => m.name.toLowerCase() === name.trim().toLowerCase());
    let ministryId = known?.id;
    if (!ministryId) {
      setBusy(true);
      const r = await callApi("POST", "/api/v1/ministries", { teamTypeId, name: name.trim(), rehearsalRequiredDefault: required });
      setBusy(false);
      if (!r.ok) return setBanner({ kind: "error", title: "Posisi baru gagal dibuat", message: errMsg(r.data) });
      ministryId = r.data.id as string;
      const t = await callApi("GET", "/api/v1/teams");
      if (t.ok) setTeams(t.data.items);
    }
    await addSeat(ministryId, count);
  };
  const addTeam = async (teamTypeId: string) => {
    const name = teams.find((t) => t.id === teamTypeId)?.name ?? "tim";
    if (!(await askConfirm(`Tambahkan tim ${name} ke acara ini? Posisi bawaan tim ikut ditambahkan.`, { confirmLabel: "Tambahkan" }))) return;
    if (await run(() => callApi("POST", `/api/v1/events/${eventId}/teams`, { teamTypeId }))) { showToast(`Tim ${name} ditambahkan`); setTab(`team:${teamTypeId}`); }
  };
  const removeTeam = async (teamTypeId: string, name: string) => { if (await askConfirm(`Hapus tim ${name} beserta semua posisinya dari acara ini?`)) void run(() => callApi("DELETE", `/api/v1/events/${eventId}/teams/${teamTypeId}`)); };

  // ───────── latihan
  const openRehearsal = (s?: Reh["sessions"][number]) =>
    setRf(s ? { open: true, editId: s.id, date: ymd(s.startsAt), start: hmInput(s.startsAt), dur: Math.round((new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60000), roomId: s.room.id, note: s.note ?? "" }
      : { open: true, editId: null, date: d ? daysBefore(ymd(d.startsAt), 3) : "", start: "19:00", dur: 120, roomId: d?.room.id ?? rooms[0]?.id ?? "", note: "" }); // bawaan: 3 hari sebelum ibadah (Kamis); latihan tidak boleh sesudah ibadah
  const saveRehearsal = (ov?: { reason: string }): Promise<boolean> => {
    const body = { date: rf.date, startTime: rf.start, durationMin: rf.dur, roomId: rf.roomId, note: rf.note || null, override: ov };
    return run(
      () => (rf.editId ? callApi("PATCH", `/api/v1/events/${eventId}/rehearsals/${rf.editId}`, body) : callApi("POST", `/api/v1/events/${eventId}/rehearsals`, body)),
      () => setRf((x) => ({ ...x, open: false })),
      (reason) => saveRehearsal({ reason }).then(() => undefined),
    );
  };
  const delRehearsal = async (id: string) => { if (await askConfirm("Hapus sesi latihan ini?")) void run(() => callApi("DELETE", `/api/v1/events/${eventId}/rehearsals/${id}`)); };

  const sections = useMemo(() => (d ? d.teams.map((t) => ({ ...t, seats: d.seats.filter((s) => s.teamTypeId === t.teamTypeId) })) : []), [d]);
  const filled = d ? d.seats.filter((s) => s.person).length : 0;
  const total = d ? d.seats.length : 0;
  const wajib = reh ? reh.participants.filter((p) => p.rehearsalRequired).length : 0;
  const opsional = reh ? reh.participants.length - wajib : 0;
  const unusedTeams = teams.filter((t) => d && !d.teams.some((x) => x.teamTypeId === t.id));

  if (!d) return <p className="rounded-xl bg-white p-6 text-sm font-semibold text-[var(--ink-2)]">{banner ? banner.message : "Memuat…"}</p>;

  const tone = toneFor(d.title);
  const st = STATUS_LABEL[d.status] ?? STATUS_LABEL.DRAFT;
  const dt = new Date(`${ymd(d.startsAt)}T00:00:00Z`);
  const timeLabel = `${hm(d.startsAt)}–${hm(d.endsAt)}`;

  // Tab di HP: Info, satu tab per tim pelayanan, Latihan. Isi tab yang tidak aktif hanya disembunyikan (tidak dilepas), jadi isian yang belum disimpan tetap ada.
  const teamKey = (id: string) => `team:${id}`;
  const active = tab === "info" || tab === "latihan" || sections.some((t) => teamKey(t.teamTypeId) === tab) ? tab : "info";
  const hid = (k: string) => (active === k ? "" : "max-md:hidden");
  const bandTab = sections.find((t) => t.seats.some((x) => x.bandOnly)); // kartu Band/No Band ikut tab tim pemusik
  const bandKey = bandTab ? teamKey(bandTab.teamTypeId) : "info";
  const tabs = [
    { key: "info", label: "Info", badge: infoDirty && perms.editEvent && editable ? "•" : "", state: "" },
    ...sections.map((t) => {
      const n = t.seats.length, ok = t.seats.filter((x) => x.person).length;
      return { key: teamKey(t.teamTypeId), label: t.name.replace(/^tim\s+/i, ""), badge: `${ok}/${n}`, state: n > 0 && ok === n ? "ok" : "warn" };
    }),
    { key: "latihan", label: "Latihan", badge: String(reh?.sessions.length ?? 0), state: "" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Kepala */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/jadwal" aria-label="Kembali ke daftar jadwal" className="grid size-10 place-items-center rounded-xl border border-[var(--line)] bg-white text-lg font-bold">‹</Link>
          <div className="flex h-[68px] w-14 flex-none flex-col items-center justify-center rounded-t-[28px] rounded-b-[10px] leading-[1.1]" style={{ background: tone.bg, color: tone.fg, border: `1.5px solid ${tone.dot}` }} aria-hidden="true">
            <span className="text-[10.5px] font-bold tracking-[0.06em]">{WEEKDAYS[dt.getUTCDay()]}</span>
            <span className="text-[22px] font-extrabold">{ymd(d.startsAt).slice(8)}</span>
            <span className="text-[10.5px] font-bold">{MONTHS[dt.getUTCMonth()].slice(0, 3).toUpperCase()}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[24px] font-extrabold leading-tight tracking-tight">{d.title}</h2>
              <span className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: st.bg, color: st.fg }}>{st.text}</span>
            </div>
            <span className="text-[13px] font-semibold text-[var(--ink-2)]">{d.number} · {dayLong(d.startsAt)}{d.createdBy ? ` · dibuat oleh ${d.createdBy}` : ""}</span>
          </div>
        </div>
        {perms.publish && d.status === "CANCELLED" && (
          <div className="flex flex-wrap gap-2.5 max-md:hidden">
            <button className={btnPrimary} disabled={busy} onClick={reopen}>Aktifkan kembali</button>
          </div>
        )}
        {perms.publish && editable && (
          <div className="flex flex-wrap gap-2.5 max-md:hidden">
            {d.status === "DRAFT" && <button className={btnPrimary} disabled={busy} onClick={publish}>Terbitkan jadwal</button>}
            {d.status === "PUBLISHED" && <button className={btnPrimary} disabled={busy} onClick={() => setNotifyOpen(true)}>Beri tahu pelayan</button>}
            {d.status === "PUBLISHED" && <button className={btnGhost} disabled={busy} onClick={unpublish}>Tarik ke draf</button>}
            <button className="h-11 rounded-xl border border-[#F0C9C9] bg-white px-4 text-sm font-bold text-[#9B1C1C] hover:bg-[#FFF5F5]" onClick={() => setCancelOpen((v) => !v)}>Batalkan acara</button>
          </div>
        )}
      </div>

      <Fab dot={infoDirty && perms.editEvent && editable} quick={perms.editEvent && editable && infoDirty ? "save" : undefined} actions={[
        ...(perms.editEvent && editable ? [{ key: "save", label: "Simpan perubahan", icon: "save" as const, tone: "primary" as const, disabled: busy || !infoDirty, busy, onClick: () => { void saveInfo(); } }] : []),
        ...(perms.publish && editable && d.status === "DRAFT" ? [{ key: "publish", label: "Terbitkan jadwal", icon: "publish" as const, tone: "gold" as const, disabled: busy, onClick: () => { void publish(); } }] : []),
        ...(perms.publish && editable && d.status === "PUBLISHED" ? [{ key: "notify", label: "Beri tahu pelayan", icon: "bell" as const, tone: "gold" as const, disabled: busy, onClick: () => setNotifyOpen(true) }] : []),
        ...(perms.publish && editable && d.status === "PUBLISHED" ? [{ key: "unpublish", label: "Tarik ke draf", icon: "unpublish" as const, tone: "neutral" as const, disabled: busy, onClick: () => { void unpublish(); } }] : []),
        ...(perms.publish && d.status === "CANCELLED" ? [{ key: "reopen", label: "Aktifkan kembali", icon: "check" as const, tone: "primary" as const, disabled: busy, busy, onClick: () => { void reopen(); } }] : []),
        ...(perms.publish && editable ? [{ key: "cancel", label: "Batalkan acara", icon: "cancel" as const, tone: "danger" as const, onClick: () => { setCancelOpen(true); setTimeout(() => document.getElementById("batalkan-acara")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); } }] : []),
      ]} />

      {notifyOpen && <NotifyStaff eventId={eventId} title={d.title} onClose={() => setNotifyOpen(false)} />}

      {cancelOpen && (
        <div id="batalkan-acara" className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#F0C9C9] bg-[#FFF8F8] p-4">
          <label className="flex min-w-60 flex-1 flex-col gap-1.5 text-[13px] font-bold">Alasan pembatalan
            <input className={inputCls} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="mis. gedung dipakai acara lain" />
          </label>
          <button className="h-11 rounded-xl bg-[#B42318] px-5 text-sm font-bold text-white disabled:opacity-50" disabled={busy || cancelReason.trim().length < 3} onClick={cancel}>Ya, batalkan</button>
        </div>
      )}

      {banner && (
        <>
        {/* HP: kartu ini menjadi dialog melayang di tengah layar, jadi tidak terlewat saat halaman digulir */}
        <div className="fixed inset-0 z-[74] bg-[#171a2c]/45 backdrop-blur-[2px] md:hidden" onClick={() => setBanner(null)} aria-hidden="true" />
        <div role="alert" data-keep className={`flex flex-col gap-3 rounded-2xl border p-4 max-md:fixed max-md:inset-x-4 max-md:top-1/2 max-md:z-[75] max-md:max-h-[80vh] max-md:-translate-y-1/2 max-md:overflow-y-auto max-md:shadow-[0_24px_60px_-20px_rgba(30,34,90,0.5)] ${banner.kind === "error" ? "border-[#F0C9C9] bg-[#FFF5F5]" : "border-[#EAD9AE] bg-[#FFFBF0]"}`}>
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={`text-sm font-extrabold ${banner.kind === "error" ? "text-[#9B1C1C]" : "text-[#6F4304]"}`}>{banner.title}</span>
              <span className="text-sm font-medium text-[#3A3F58]">{banner.message}</span>
            </div>
            <button onClick={() => setBanner(null)} className="rounded-lg px-2.5 py-1 text-xs font-bold text-[var(--ink-2)] hover:bg-white">Tutup</button>
          </div>
          {banner.override && (
            <div className="flex flex-wrap items-end gap-3 border-t border-[#F0C9C9] pt-3">
              <label className="flex min-w-60 flex-1 flex-col gap-1.5 text-[13px] font-bold">Tembus bentrok sebagai Superadmin — alasan wajib dicatat
                <input className={inputCls} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="min. 5 karakter" />
              </label>
              <button className="h-11 rounded-xl bg-[#B42318] px-5 text-sm font-bold text-white disabled:opacity-50" disabled={busy || overrideReason.trim().length < 5} onClick={() => banner.override!(overrideReason.trim())}>Tembus bentrok</button>
            </div>
          )}
        </div>
        </>
      )}

      {d.locked && (
        <div role="status" className="rounded-2xl border border-[#EAD9AE] bg-[#FFFBF0] px-4 py-3 text-sm font-semibold text-[#6F4304]">Ibadah ini sudah lewat 2 bulan, jadi hanya bisa dilihat dan tidak bisa diubah lagi.</div>
      )}

      {/* HP: ringkasan terisi dan tab (Info, tiap tim, Latihan); di desktop semua bagian tampil bersamaan */}
      <div ref={topRef} className="scroll-mt-2 md:hidden" aria-hidden="true" />
      <div className="-mb-3 flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3 md:hidden">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className={`text-[13px] font-extrabold ${filled === total && total > 0 ? "text-[#1B6B34]" : "text-[#6F4304]"}`}>{filled === total && total > 0 ? "Semua posisi terisi" : `${total - filled} posisi belum terisi`}</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#ECEEF4]"><div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${total ? (filled / total) * 100 : 0}%` }} /></div>
        </div>
        <span className="flex-none text-sm font-extrabold tabular-nums">{filled}<span className="font-semibold text-[var(--ink-2)]"> / {total}</span></span>
      </div>
      {/* baris tab menempel di atas layar saat digulir; harus anak langsung dari kolom halaman supaya tetap menempel sepanjang halaman */}
      <div className={`${stickyPage} -mb-2 md:hidden`}>
        <div role="tablist" aria-label="Bagian jadwal" className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const on = active === t.key;
            return (
              <button key={t.key} id={`etab-${t.key}`} role="tab" type="button" aria-selected={on} onClick={() => setTab(t.key)}
                className={`flex h-11 flex-none items-center gap-2 whitespace-nowrap rounded-xl border px-4 text-sm font-bold ${on ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--line)] bg-white text-[var(--primary-ink)]"}`}>
                {t.label}
                {t.badge && (
                  <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-extrabold tabular-nums ${on ? "bg-white/25 text-white" : t.state === "ok" ? "bg-[#E3F3E7] text-[#1B6B34]" : t.state === "warn" ? "bg-[#FBEFD6] text-[#6F4304]" : "bg-[var(--bg)] text-[var(--ink-2)]"}`}>{t.badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        {/* Kiri */}
        <div className={`flex min-w-0 flex-[999_1_560px] flex-col gap-5 ${active === "latihan" ? "max-md:hidden" : ""}`}>
          <section className={`${card} ${hid("info")}`}>
            <SectionTitle>Informasi acara</SectionTitle>
            <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1.5 text-[13px] font-bold sm:col-span-2 lg:col-span-3">Judul
                <input className={inputCls} value={f.title} disabled={!perms.editEvent || !editable} onChange={(e) => setF({ ...f, title: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold">Tanggal
                <input type="date" className={inputCls} value={f.date} disabled={!perms.editEvent || !editable} onChange={(e) => setF({ ...f, date: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold">Mulai
                <input type="time" className={inputCls} value={f.start} disabled={!perms.editEvent || !editable} onChange={(e) => setF({ ...f, start: e.target.value, end: addToTime(e.target.value, Math.max(diffMin(f.start, f.end), 15)) })} />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold">Selesai
                <input type="time" className={inputCls} value={f.end} disabled={!perms.editEvent || !editable} onChange={(e) => setF({ ...f, end: e.target.value })} />
              </label>
              {!f.onl.online && (
                <label className="flex flex-col gap-1.5 text-[13px] font-bold">Ruangan
                  <select className={inputCls} value={f.roomId} disabled={!perms.editEvent || !editable} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
                    {!f.roomId && <option value="">Pilih ruangan…</option>}
                    <RoomOptions rooms={rooms.filter((r) => r.isActive || r.id === f.roomId)} />
                  </select>
                </label>
              )}
              <div className="sm:col-span-2 lg:col-span-3"><OnlineFields kind="IBADAH" value={f.onl} onChange={(onl) => setF({ ...f, onl })} disabled={!perms.editEvent || !editable} /></div>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold">Kehadiran dicatat
                <select className={inputCls} value={f.mode} disabled={!perms.editEvent || !editable} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                  <option value="COUNT">Jumlah saja</option>
                  <option value="NAMES">Per nama</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold sm:col-span-2 lg:col-span-3">Tema ibadah <span className="font-medium text-[var(--ink-2)]">(opsional)</span>
                <textarea rows={2} maxLength={600} className={`${inputCls} h-auto min-h-[44px] py-2.5`} value={f.theme} disabled={!perms.editEvent || !editable} onChange={(e) => setF({ ...f, theme: e.target.value })} placeholder="mis. Hidup dalam terang kasih Kristus" />
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold sm:col-span-2 lg:col-span-3">Padus <span className="font-medium text-[var(--ink-2)]">(opsional, catatan saja)</span>
                <input maxLength={200} className={inputCls} value={f.padus} disabled={!perms.editEvent || !editable} onChange={(e) => setF({ ...f, padus: e.target.value })} placeholder="mis. Padus Rayon 3 membawakan 2 lagu" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[var(--ink-2)]">Waktu dan ruangan bisa diubah untuk acara ini saja. Orang yang sudah dijadwalkan ikut pindah jam, dan ditolak bila bentrok.</span>
              {perms.editEvent && editable && <button className={`${btnPrimary} max-md:hidden`} disabled={busy} onClick={saveInfo}>Simpan perubahan</button>}
            </div>
          </section>

          {(d.attendance || (d.status === "PUBLISHED" && perms.editEvent)) && (
            <section className={`${card} ${hid("info")}`}>
              <div className="flex flex-wrap items-center gap-3">
                <SectionTitle>Kehadiran</SectionTitle>
                <span className="flex-1" />
                {perms.editEvent && d.attendanceOpen && <Link href={`/hadir/${d.id}`} className={btnGhost}>{d.attendance ? "Ubah kehadiran" : "Isi kehadiran"}</Link>}
              </div>
              {d.attendance ? (
                <p className="mt-2 text-sm font-semibold">
                  <span className="text-[22px] font-extrabold">{d.attendance.total}</span> orang hadir
                  {d.attendance.mode === "NAMES" && <span className="text-xs font-medium text-[var(--ink-2)]"> (dicatat per nama)</span>}
                  {d.attendance.note && <span className="mt-1 block text-xs font-medium text-[var(--ink-2)]">Catatan: {d.attendance.note}</span>}
                </p>
              ) : <p className="mt-2 text-sm font-medium text-[var(--ink-2)]">Belum ada kehadiran yang dicatat.</p>}
              <p className="mt-2 text-xs font-semibold text-[var(--ink-2)]">Bisa diisi atau diubah mulai tanggal ibadah sampai 1 bulan sesudahnya.</p>
            </section>
          )}

          {d.pair && editable && perms.assign && (
            <div className={`flex flex-wrap items-center gap-3 rounded-2xl border border-[#D0D3E8] bg-[#FAFAFF] px-5 py-3.5 ${hid("info")}`}>
              <span className="min-w-0 flex-1 text-sm font-semibold text-[#3A3F58]">
                Hari ini juga ada <Link href={`/jadwal/${d.pair.id}`} className="font-extrabold text-[var(--primary-ink)] underline">{d.pair.title}</Link>
                {d.pair.filled > 0 ? ` (${d.pair.filled} kursi terisi).` : " (belum ada personel)."} Saat mengubah kursi, tema, atau mode band di sini, Anda akan ditanya apakah perubahannya juga berlaku di sana.
              </span>
              {(d.pair.filled > 0 || d.pair.sessions > 0) && (
                <button type="button" className={`${btnGhost} whitespace-nowrap`} disabled={busy} onClick={copyFromPair}>
                  <span className="max-md:hidden">Isi dari {d.pair.title}</span>
                  <span className="md:hidden">Isi dari {d.pair.title.replace(/^ibadah\s+/i, "")}</span>
                </button>
              )}
            </div>
          )}

          {(d.bandMode === "NO_BAND" || d.seats.some((x) => x.bandOnly)) && (
            <section className={`${card} ${hid(bandKey)}`}>
              <div className="flex flex-wrap items-center gap-3">
                <SectionTitle>Band atau No Band</SectionTitle>
                <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${d.bandMode === "NO_BAND" ? "bg-[var(--gold-soft)] text-[#6F4304]" : "bg-[var(--primary-soft)] text-[var(--primary-ink)]"}`}>{d.bandMode === "NO_BAND" ? "No Band" : "Band"}</span>
                <span className="flex-1" />
                {perms.assign && editable && (
                  d.bandMode === "BAND"
                    ? <button className={btnGhost} disabled={busy} onClick={() => (d.seats.some((x) => x.bandOnly && x.person) ? setBandAsk(true) : void setBand("NO_BAND"))}>Jadikan No Band</button>
                    : <button className={btnGhost} disabled={busy} onClick={() => void setBand("BAND")}>Kembalikan ke Band</button>
                )}
              </div>
              <p className="mt-2 text-xs font-semibold text-[var(--ink-2)]">{d.bandMode === "NO_BAND" ? "No Band: hanya piano, keyboard, atau PSR. Posisi bass, gitar, drum dan sejenisnya tidak dipakai." : "Band: lengkap dengan bass, gitar, drum dan sejenisnya."}</p>
              {bandAsk && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#EAD9AE] bg-[#FFFBF0] p-3.5">
                  <span className="min-w-0 flex-1 text-sm font-semibold text-[#6F4304]">Posisi band yang sudah terisi akan dihapus dari acara ini dan orangnya dilepas. Lanjutkan?</span>
                  <button className="h-10 rounded-xl bg-[#B42318] px-4 text-sm font-bold text-white disabled:opacity-50" disabled={busy} onClick={() => void setBand("NO_BAND")}>Ya, jadikan No Band</button>
                  <button className={`${btnGhost} h-10`} onClick={() => setBandAsk(false)}>Batal</button>
                </div>
              )}
            </section>
          )}

          {sections.map((t) => {
            const allReq = t.seats.length > 0 && t.seats.every((s) => s.rehearsalRequired);
            const teamMin = teams.find((x) => x.id === t.teamTypeId)?.ministries ?? [];
            const mayEditTeam = editable && perms.assign && (perms.scope === null || perms.scope.includes(t.teamTypeId));
            return (
              <section key={t.teamTypeId} className={`${card} ${hid(teamKey(t.teamTypeId))}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <SectionTitle>{t.name}</SectionTitle>
                  <span className="whitespace-nowrap rounded-full bg-[var(--bg)] px-2.5 py-0.5 text-xs font-bold text-[var(--ink-2)]">{t.seats.filter((s) => s.person).length}/{t.seats.length}</span>
                  <span className="flex-1" />
                  {perms.rehearsal && mayEditTeam && t.seats.length > 0 && (
                    <label className="flex items-center gap-2.5 text-[12.5px] font-bold text-[var(--ink-2)]">Wajib latihan
                      <Switch checked={allReq} disabled={busy} onChange={(v) => void bulkRequired(t.teamTypeId, v, t.name)} label={`Wajib latihan semua posisi ${t.name}`} />
                    </label>
                  )}
                  {perms.editEvent && editable && <button onClick={() => removeTeam(t.teamTypeId, t.name)} className="rounded-lg px-2 py-1 text-xs font-bold text-[#9B1C1C] hover:bg-[#FFF5F5]">Hapus tim</button>}
                </div>

                <div className="mt-3 flex flex-col divide-y divide-[var(--line-2)]">
                  {t.seats.length === 0 && <p className="py-3 text-sm text-[var(--ink-2)]">Belum ada posisi di tim ini.</p>}
                  {t.seats.map((s) => (
                    <div key={s.id} className="flex flex-col gap-2.5 py-2.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="flex-none text-sm font-semibold text-[var(--ink-2)] max-md:order-1 max-md:flex-1 md:w-32">{s.label}</span>
                        {s.person ? (
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 max-md:order-3 max-md:basis-full">
                            <span className="grid size-8 flex-none place-items-center rounded-full bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary-ink)]" aria-hidden="true">{initials(s.person.name)}</span>
                            <span className="min-w-0 break-words text-sm font-bold">{s.person.name}</span>
                            {s.ministryName === "Pembicara" && <span className="whitespace-nowrap rounded-full bg-[var(--gold-soft)] px-2 py-0.5 text-[11px] font-bold text-[#6F4304]" title={s.person.originChurch ?? undefined}>{s.person.origin === "LUAR" ? <>Luar{s.person.originChurch && <span className="hidden md:inline"> · {s.person.originChurch}</span>}</> : "Dalam"}</span>}
                          </div>
                        ) : (
                          <div className="flex-1 max-md:order-3 max-md:basis-full">
                            {seatEditable(s) ? (
                              <button onClick={() => setPicker(picker === s.id ? null : s.id)} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-xl border border-dashed border-[#B9BDDA] px-3.5 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[#f3f4fb]">＋ Pilih<span className="hidden md:inline"> orang</span></button>
                            ) : <span className="text-sm font-semibold italic text-[#B7791F]">Belum diisi</span>}
                          </div>
                        )}
                        {s.person && seatEditable(s) && (
                          <div className="flex items-center gap-1 max-md:order-4 max-md:flex-1">
                            <button onClick={() => setPicker(picker === s.id ? null : s.id)} className="rounded-lg px-2.5 py-1 text-xs font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Ganti</button>
                            <button onClick={() => void assignSeat(s, null)} className="rounded-lg px-2.5 py-1 text-xs font-bold text-[var(--ink-2)] hover:bg-[var(--bg)]">Kosongkan</button>
                          </div>
                        )}
                        {perms.rehearsal && seatEditable(s) && (
                          <label className="flex items-center gap-2 text-xs font-bold text-[var(--ink-2)] max-md:order-5">Wajib latihan
                            <Switch checked={s.rehearsalRequired} disabled={busy} onChange={(v) => void setRequired(s.id, v).then((ok) => ok && showToast(v ? `Wajib latihan ${s.label}` : `Tidak wajib latihan ${s.label}`))} label={`Wajib latihan ${s.label}`} />
                          </label>
                        )}
                        {perms.editEvent && editable && <button onClick={() => removeSeat(s.id, s.label)} aria-label={`Hapus posisi ${s.label}`} className="grid size-7 flex-none place-items-center rounded-lg max-md:order-2 text-[var(--ink-2)] hover:bg-[#FFF5F5] hover:text-[#9B1C1C]">✕</button>}
                      </div>
                      {picker === s.id && (
                        <SeatPicker canAddPerson={perms.addPerson} eventId={eventId} seatId={s.id} seatLabel={s.label} timeLabel={timeLabel} onClose={() => setPicker(null)} onPick={(pid) => void assignSeat(s, pid)} />
                      )}
                    </div>
                  ))}
                </div>

                {perms.editEvent && editable && (
                  addSeatTeam === t.teamTypeId ? (
                    <AddSeatForm ministries={teamMin} canCreate={perms.editEvent} onAdd={addSeat} onCreate={(name, req, n) => addNewSeat(t.teamTypeId, name, req, n)} onClose={() => setAddSeatTeam(null)} busy={busy} />
                  ) : (
                    <button onClick={() => setAddSeatTeam(t.teamTypeId)} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">＋ Tambah posisi</button>
                  )
                )}
              </section>
            );
          })}

          {perms.editEvent && editable && unusedTeams.length > 0 && (
            <div className={`flex flex-wrap items-center gap-3 rounded-[20px] border border-dashed border-[#B9BDDA] p-4 ${hid("info")}`}>
              <span className="text-sm font-bold text-[var(--ink-2)]">Tambah tim untuk acara ini · mis. bagi roti &amp; anggur</span>
              <select aria-label="Pilih tim" className="h-10 rounded-xl border border-[var(--line)] bg-white px-3 text-sm font-semibold" defaultValue="" onChange={(e) => { if (e.target.value) { void addTeam(e.target.value); e.target.value = ""; } }}>
                <option value="">Pilih tim…</option>
                {unusedTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Kanan */}
        <aside className={`lg:sticky lg:top-[calc(var(--header-h)+16px)] lg:max-h-[calc(100vh-var(--header-h)-32px)] lg:self-start lg:overflow-y-auto flex min-w-[300px] max-md:min-w-0 max-w-[400px] flex-[1_1_320px] flex-col gap-5 ${hid("latihan")}`}>
          <section className={`${card} max-md:hidden`}>
            <SectionTitle>Cek jadwal</SectionTitle>
            <div className={`mt-4 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-bold ${filled === total && total > 0 ? "bg-[#E3F3E7] text-[#1B6B34]" : "bg-[#FBEFD6] text-[#6F4304]"}`}>
              {filled === total && total > 0 ? "Semua posisi terisi, tidak ada bentrok" : `${total - filled} posisi belum terisi`}
            </div>
            <div className="mt-3 flex justify-between text-[13px] font-semibold"><span className="text-[var(--ink-2)]">Posisi terisi</span><span>{filled} / {total}</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ECEEF4]"><div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${total ? (filled / total) * 100 : 0}%` }} /></div>
            <p className="mt-3 text-xs font-medium text-[var(--ink-2)]">Orang dan ruangan yang sudah terpakai pada jam yang beririsan tidak bisa dipilih lagi.</p>
          </section>

          <section className={card}>
            <div className="flex items-center gap-3"><SectionTitle>Jadwal latihan</SectionTitle><span className="flex-1" /><span className="whitespace-nowrap rounded-full bg-[var(--bg)] px-2.5 py-0.5 text-xs font-bold text-[var(--ink-2)]">{reh?.sessions.length ?? 0} kali</span></div>
            <div className="mt-3 flex flex-col gap-2.5">
              {reh?.sessions.length === 0 && <p className="text-sm text-[var(--ink-2)]">Belum ada sesi latihan.</p>}
              {reh?.sessions.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl bg-[var(--bg)] p-2.5">
                  <div className="grid h-12 w-11 flex-none place-items-center rounded-lg bg-white text-center text-[10px] font-bold leading-tight text-[var(--ink-2)]" aria-hidden="true">
                    <span>{WEEKDAYS[new Date(`${ymd(s.startsAt)}T00:00:00Z`).getUTCDay()]}<br /><span className="text-[17px] font-extrabold text-[var(--ink)]">{ymd(s.startsAt).slice(8)}</span></span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="text-sm font-bold">Latihan ke-{s.seq}{d && new Date(s.startsAt).getTime() >= new Date(d.startsAt).getTime() && <span className="ml-2 rounded-md bg-[#FDECEC] px-1.5 py-0.5 text-[11px] font-extrabold text-[#A12B2B]">Sesudah ibadah, ubah</span>}</span>
                    <span className="text-xs font-semibold text-[var(--ink-2)]">{dayShort(s.startsAt)} · {hm(s.startsAt)}–{hm(s.endsAt)} · {s.room.name}</span>
                    {s.shared && d?.pair && <span className="text-xs font-semibold text-[#1B6B34]">Juga berlaku untuk {d.pair.title}</span>}
                    {s.note && <span className="truncate text-xs text-[var(--ink-2)]">{s.note}</span>}
                  </div>
                  {perms.rehearsal && editable && (
                    <div className="flex flex-col">
                      <button onClick={() => openRehearsal(s)} className="rounded px-2 text-xs font-bold text-[var(--primary-ink)] hover:bg-white">Ubah</button>
                      <button onClick={() => delRehearsal(s.id)} className="rounded px-2 text-xs font-bold text-[#9B1C1C] hover:bg-white">Hapus</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {rf.open && (
              <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-[#D0D3E8] bg-[#FAFAFF] p-4">
                <span className="text-sm font-extrabold">{rf.editId ? "Ubah sesi latihan" : "Tambah sesi latihan"}</span>
                <div className="grid grid-cols-2 gap-3">
                  <label className="col-span-2 flex flex-col gap-1.5 text-[13px] font-bold">Tanggal<input type="date" className={inputCls} value={rf.date} max={d ? ymd(d.startsAt) : undefined} onChange={(e) => setRf({ ...rf, date: e.target.value })} /></label>
                  <label className="flex flex-col gap-1.5 text-[13px] font-bold">Mulai<input type="time" className={inputCls} value={rf.start} onChange={(e) => setRf({ ...rf, start: e.target.value })} /></label>
                  <label className="flex flex-col gap-1.5 text-[13px] font-bold">Durasi (menit)<input type="number" min={15} max={480} step={15} className={inputCls} value={rf.dur} onChange={(e) => setRf({ ...rf, dur: Number(e.target.value) })} /></label>
                  <label className="col-span-2 flex flex-col gap-1.5 text-[13px] font-bold">Ruangan
                    <select className={inputCls} value={rf.roomId} onChange={(e) => setRf({ ...rf, roomId: e.target.value })}><RoomOptions rooms={rooms.filter((r) => r.isActive || r.id === rf.roomId)} /></select>
                  </label>
                  <label className="col-span-2 flex flex-col gap-1.5 text-[13px] font-bold">Catatan<input className={inputCls} value={rf.note} onChange={(e) => setRf({ ...rf, note: e.target.value })} placeholder="opsional" /></label>
                </div>
                <p className="text-xs font-medium text-[var(--ink-2)]">Latihan harus sebelum ibadah dimulai.{d?.pair && !rf.editId ? ` Cukup dibuat sekali: otomatis berlaku juga untuk ${d.pair.title}.` : ""}{d?.pair && rf.editId ? ` Perubahan ikut ke ${d.pair.title} bila latihannya sama.` : ""}</p>
                <div className="flex gap-2.5">
                  <button className={btnPrimary} disabled={busy || !rf.date || !rf.roomId} onClick={() => saveRehearsal()}>Simpan sesi</button>
                  <button className={btnGhost} onClick={() => setRf({ ...rf, open: false })}>Batal</button>
                </div>
              </div>
            )}
            {perms.rehearsal && editable && !rf.open && <button onClick={() => openRehearsal()} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#B9BDDA] text-sm font-bold text-[var(--primary-ink)] hover:bg-[#f3f4fb]">＋ Tambah sesi latihan</button>}

            <div className="mt-4 flex flex-col gap-1.5 border-t border-[var(--line-2)] pt-3 text-[13px] font-semibold">
              <div className="flex justify-between"><span className="text-[var(--ink-2)]">Peserta wajib hadir</span><span>{wajib} orang</span></div>
              <div className="flex justify-between"><span className="text-[var(--ink-2)]">Peserta tidak wajib</span><span>{opsional} orang</span></div>
            </div>
          </section>
        </aside>
      </div>
      {saved && <SavedDialog onStay={() => setSaved(false)} />}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <h3 className="text-[13px] font-extrabold uppercase tracking-[0.07em] text-[var(--gold-ink)]">{children}</h3>
    </div>
  );
}

const NEW_POSITION = "__new__";
function AddSeatForm({ ministries, canCreate, onAdd, onCreate, onClose, busy }: {
  ministries: { id: string; name: string }[]; canCreate: boolean; onAdd: (ministryId: string, count: number) => void;
  onCreate: (name: string, rehearsalRequired: boolean, count: number) => void; onClose: () => void; busy: boolean;
}) {
  const [m, setM] = useState("");
  const [n, setN] = useState(1);
  const [name, setName] = useState("");
  const [req, setReq] = useState(false);
  const isNew = m === NEW_POSITION;
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-[#D0D3E8] bg-[#FAFAFF] p-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-44 flex-1 flex-col gap-1.5 text-[13px] font-bold">Posisi
          <select className={inputCls} value={m} onChange={(e) => setM(e.target.value)}>
            <option value="">Pilih posisi…</option>
            {ministries.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            {canCreate && <option value={NEW_POSITION}>＋ Tambah posisi baru</option>}
          </select>
        </label>
        <label className="flex w-24 flex-col gap-1.5 text-[13px] font-bold">Jumlah<input type="number" min={1} max={10} className={inputCls} value={n} onChange={(e) => setN(Math.max(1, Number(e.target.value)))} /></label>
        <button className={btnPrimary} disabled={!m || (isNew && !name.trim()) || busy} onClick={() => (isNew ? onCreate(name, req, n) : onAdd(m, n))}>Tambah</button>
        <button className={btnGhost} onClick={onClose}>Batal</button>
      </div>
      {isNew && (
        <div className="flex flex-wrap items-end gap-3 border-t border-[var(--line)] pt-3">
          <label className="flex min-w-44 flex-1 flex-col gap-1.5 text-[13px] font-bold">Nama posisi baru
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="flex h-11 items-center gap-2 text-[13px] font-bold"><input type="checkbox" checked={req} onChange={(e) => setReq(e.target.checked)} /> Wajib latihan</label>
          <p className="basis-full text-xs font-medium text-[var(--ink-2)]">Posisi ini disimpan ke tim, jadi bisa dipakai lagi di acara lain. Tandai orang yang bisa melayani di sini lewat menu Orang, atau saat memilih orang (centang &ldquo;tampilkan juga orang yang belum tercatat&rdquo;).</p>
        </div>
      )}
    </div>
  );
}

/** Popup setelah perubahan tersimpan: tetap di editor atau kembali ke kalender. */
function SavedDialog({ onStay }: { onStay: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onStay(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStay]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#171a2c]/40 p-4 backdrop-blur-[2px]" onClick={onStay}>
      <div role="dialog" aria-modal="true" aria-labelledby="saved-title" onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-[22px] border border-[var(--line)] bg-white p-7 text-center shadow-[0_24px_60px_-20px_rgba(30,34,90,0.45)]">
        <span className="grid size-14 place-items-center rounded-full bg-[#E3F4E8] text-[#1B6B34]" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="saved-title" className="text-lg font-extrabold">Perubahan tersimpan</h2>
          <p className="text-sm font-medium text-[var(--ink-2)]">Informasi acara berhasil diperbarui.</p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Link href="/" className={`${btnPrimary} flex items-center justify-center`} autoFocus>Kembali ke kalender</Link>
          <button type="button" className={btnGhost} onClick={onStay}>Tetap di halaman ini</button>
        </div>
      </div>
    </div>
  );
}
