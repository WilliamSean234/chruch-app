"use client";

import Fab from "@/components/ui/Fab";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { callApi, errMsg, inputCls } from "@/components/jadwal/api";
import Modal, { Field } from "@/components/master/Modal";
import SavedDialog from "@/components/ui/SavedDialog";
import { Alert, FilterBar, FSearch, FSelect, listCard } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import { useClientPaging, useDebounced } from "@/components/ui/usePagedList";
import { askConfirm } from "@/components/ui/Confirm";
import { initials } from "@/lib/ui";

type Person = { id: string; name: string };
export type AttendanceState =
  | { mode: "COUNT"; status: string; summary: { total: number; note: string | null; recordedAt: string } | null }
  | { mode: "NAMES"; status: string; community: { id: string; name: string } | null; presentCount: number; present: { personId: string; name: string }[]; candidates: { id: string; name: string; present: boolean }[] };

type Dup = { id: string; name: string; birthDate: string | null; position: string };

const barBtn = "h-[52px] flex-1 rounded-[14px] bg-[var(--primary)] text-[15px] font-bold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";

export default function AttendanceMobile({ eventId, initial, published, assigned }: { eventId: string; initial: AttendanceState; published: boolean; assigned: boolean }) {
  return initial.mode === "COUNT"
    ? <CountMode eventId={eventId} initial={initial} published={published} />
    : <NamesMode eventId={eventId} initial={initial} published={published} assigned={assigned} />;
}

/** Bilah bawah: total dan tombol simpan (nonaktif sampai ada perubahan). */
function SaveBar({ total, dirty, saving, disabled, onSave }: { total: number; dirty: boolean; saving: boolean; disabled?: boolean; onSave: () => void }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-5 flex items-center gap-3.5 border-t border-[var(--line)] bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 md:mx-0 md:rounded-2xl md:border md:pb-3">
      <div className="flex flex-col leading-tight">
        <span className="text-xs font-semibold text-[var(--ink-2)]">Total hadir</span>
        <span className="text-[22px] font-extrabold tabular-nums">{total}</span>
      </div>
      <button type="button" className={`${barBtn} md:max-w-xs md:flex-none md:px-8 max-md:hidden`} disabled={!dirty || saving || disabled} onClick={onSave}>
        {saving ? "Menyimpan…" : "Simpan kehadiran"}
      </button>
      {dirty && <span className="text-xs font-bold text-[#8A6119]">Ada perubahan belum disimpan</span>}
      <Fab noTabs dot={dirty} actions={[{ key: "save", label: saving ? "Menyimpan…" : "Simpan kehadiran", icon: "save", disabled: !dirty || saving || !!disabled, busy: saving, onClick: onSave }]} />
    </div>
  );
}

function useLeaveWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
}

function ModeChip({ mode, community }: { mode: "COUNT" | "NAMES"; community?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="whitespace-nowrap rounded-full bg-[#E7E9F3] px-3 py-1.5 text-[12.5px] font-extrabold text-[var(--primary-ink)]">{mode === "COUNT" ? "Jumlah saja" : "Per nama"}</span>
      {community && <span className="whitespace-nowrap rounded-full bg-[#E4F3EC] px-3 py-1.5 text-[12.5px] font-extrabold text-[#14603E]">{community}</span>}
      <span className="text-xs font-medium text-[var(--ink-2)]">Cara mencatat diatur Penjadwal di pengaturan acara.</span>
    </div>
  );
}

function SavedAfter({ message, onClose }: { message: string; onClose: () => void }) {
  const router = useRouter();
  return (
    <SavedDialog title="Kehadiran tersimpan" message={message} onClose={onClose}
      actions={[{ label: "Ke jadwal saya", primary: true, onClick: () => router.push("/saya") }, { label: "Tetap di halaman ini", onClick: onClose }]} />
  );
}

/* ───────── Mode jumlah saja ───────── */
function CountMode({ eventId, initial, published }: { eventId: string; initial: Extract<AttendanceState, { mode: "COUNT" }>; published: boolean }) {
  const [saved, setSaved] = useState(initial.summary);
  const [count, setCount] = useState(initial.summary?.total ?? 0);
  const [note, setNote] = useState(initial.summary?.note ?? "");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const dirty = touched && (!saved || count !== saved.total || note.trim() !== (saved.note ?? ""));
  useLeaveWarning(dirty);

  const set = (n: number) => { setCount(Math.max(0, Math.min(100000, n))); setTouched(true); };
  async function save() {
    setSaving(true); setErr("");
    const r = await callApi("PUT", `/api/v1/events/${eventId}/attendance/summary`, { total: count, note: note.trim() || null });
    setSaving(false);
    if (!r.ok) { setErr(errMsg(r.data)); return; }
    setSaved(r.data); setTouched(false); setDone(true);
  }

  return (
    <>
      <ModeChip mode="COUNT" />
      {!published && <Alert>Acara ini belum diterbitkan, jadi kehadiran belum bisa dicatat.</Alert>}
      {err && <Alert>{err}</Alert>}
      <section className="flex flex-col items-center gap-[18px] rounded-[20px] border border-[var(--line)] bg-white px-5 py-7 md:max-w-md">
        <span className="text-[13px] font-bold text-[var(--ink-2)]">Jumlah yang hadir</span>
        <div className="flex items-center gap-5">
          <button type="button" aria-label="Kurangi" onClick={() => set(count - 1)} disabled={count <= 0}
            className="grid size-14 place-items-center rounded-full border-[1.5px] border-[#D0D3E8] bg-white text-[var(--primary-ink)] disabled:opacity-40">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
          </button>
          <input aria-label="Jumlah hadir" inputMode="numeric" value={count} onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")) || 0)}
            className="w-28 border-0 bg-transparent text-center text-[56px] font-extrabold tabular-nums tracking-tight outline-none" />
          <button type="button" aria-label="Tambah" onClick={() => set(count + 1)} className="grid size-14 place-items-center rounded-full bg-[var(--primary)] text-white">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
        <span className="h-0.5 w-7 rounded bg-[var(--gold)]" aria-hidden="true" />
        <div className="w-full">
          <Field label="Catatan (opsional)">
            <input className={inputCls} value={note} maxLength={300} placeholder="Mis. ada 3 tamu baru" onChange={(e) => { setNote(e.target.value); setTouched(true); }} />
          </Field>
        </div>
        {saved && <span className="text-xs font-medium text-[var(--ink-2)]">Terakhir dicatat: {saved.total} orang</span>}
      </section>
      <SaveBar total={count} dirty={dirty} saving={saving} disabled={!published} onSave={save} />
      {done && <SavedAfter message={`Jumlah hadir tercatat ${count} orang.`} onClose={() => setDone(false)} />}
    </>
  );
}

/* ───────── Mode per nama ───────── */
function NamesMode({ eventId, initial, published, assigned }: { eventId: string; initial: Extract<AttendanceState, { mode: "NAMES" }>; published: boolean; assigned: boolean }) {
  const community = initial.community;
  const [known, setKnown] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const c of initial.candidates) m[c.id] = c.name;
    for (const p of initial.present) m[p.personId] = p.name;
    return m;
  });
  const [saved, setSaved] = useState<Set<string>>(() => new Set(initial.present.map((p) => p.personId)));
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initial.present.map((p) => p.personId)));
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [found, setFound] = useState<string[]>([]); // hasil cari di server (acara tanpa komunitas)
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [guest, setGuest] = useState(false);
  const dq = useDebounced(q.trim(), 350);

  const add = useMemo(() => [...checked].filter((id) => !saved.has(id)), [checked, saved]);
  const remove = useMemo(() => [...saved].filter((id) => !checked.has(id)), [checked, saved]);
  const dirty = add.length + remove.length > 0;
  useLeaveWarning(dirty);

  // Tanpa komunitas, calon peserta dicari lewat server (minimal 2 huruf).
  const seq = useRef(0);
  useEffect(() => {
    if (community || dq.length < 2) { setFound([]); return; }
    const mine = ++seq.current;
    void callApi("GET", `/api/v1/events/${eventId}/attendance?search=${encodeURIComponent(dq)}`).then((r) => {
      if (mine !== seq.current || !r.ok || r.data.mode !== "NAMES") return;
      const list = r.data.candidates as { id: string; name: string }[];
      setKnown((k) => { const n = { ...k }; for (const c of list) n[c.id] = c.name; return n; });
      setFound(list.map((c) => c.id));
    });
  }, [dq, community, eventId]);

  const people: Person[] = useMemo(() => {
    const ids = community ? Object.keys(known) : [...new Set([...saved, ...checked, ...found])];
    const needle = q.trim().toLowerCase();
    return ids
      .map((id) => ({ id, name: known[id] ?? "?" }))
      .filter((p) => {
        if (status === "present" && !checked.has(p.id)) return false;
        if (status === "absent" && checked.has(p.id)) return false;
        if (!needle) return community ? true : checked.has(p.id) || found.includes(p.id);
        return community ? p.name.toLowerCase().includes(needle) : found.includes(p.id) || p.name.toLowerCase().includes(needle);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [known, saved, checked, found, q, status, community]);

  const pg = useClientPaging(people);
  const toggle = (id: string) => setChecked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function save() {
    setSaving(true); setErr("");
    const r = await callApi("POST", `/api/v1/events/${eventId}/attendance/batch`, { add, remove });
    setSaving(false);
    if (!r.ok) { setErr(errMsg(r.data)); return; }
    setSaved(new Set(checked));
    setDone(`${checked.size} orang tercatat hadir.${add.length ? ` Ditambah ${add.length}.` : ""}${remove.length ? ` Dibatalkan ${remove.length}.` : ""}`);
  }

  async function reset() {
    if (!(await askConfirm("Buang perubahan? Tanda hadir yang belum disimpan akan dikembalikan.", { confirmLabel: "Buang perubahan" }))) return;
    setChecked(new Set(saved));
  }

  // Tamu langsung tersimpan (dibuat sebagai orang baru), jadi ikut dianggap sudah tersimpan.
  const guestAdded = (p: Person, alreadySaved: boolean) => {
    setKnown((k) => ({ ...k, [p.id]: p.name }));
    setChecked((s) => new Set(s).add(p.id));
    if (alreadySaved) setSaved((s) => new Set(s).add(p.id));
  };

  const total = community ? Object.keys(known).length : null;
  return (
    <>
      <ModeChip mode="NAMES" community={community?.name} />
      {!assigned && <p className="rounded-xl border border-[#EBDDB8] bg-[#FFFDF7] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#6F4304]">Akunmu belum dihubungkan ke data orang.</p>}
      {!published && <Alert>Acara ini belum diterbitkan, jadi kehadiran belum bisa dicatat.</Alert>}
      {err && <Alert>{err}</Alert>}

      <FilterBar active={!!(q || status)} onReset={() => { setQ(""); setStatus(""); }}>
        <FSearch value={q} onChange={setQ} placeholder={community ? "Cari nama" : "Ketik minimal 2 huruf"} />
        <FSelect label="Status" value={status} onChange={setStatus} options={[{ value: "present", label: "Sudah hadir" }, { value: "absent", label: "Belum hadir" }]} />
      </FilterBar>

      <div className="flex items-center justify-between text-[13px] font-bold text-[var(--ink-2)]">
        <span>{community ? `Daftar ${community.name}` : q.trim().length >= 2 ? "Hasil pencarian" : "Yang sudah hadir"}</span>
        <span>Hadir <span className="text-[var(--ink)]">{checked.size}</span>{total !== null && ` dari ${total}`}</span>
      </div>

      <div className={listCard}>
        {pg.slice.length === 0 ? (
          <p className="px-5 py-9 text-center text-sm font-semibold text-[var(--ink-2)]">
            {community ? "Tidak ada nama yang cocok." : q.trim().length >= 2 ? "Nama tidak ditemukan. Gunakan tombol tamu di bawah bila orangnya baru." : "Belum ada yang ditandai hadir. Cari nama di kolom atas."}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {pg.slice.map((p) => {
              const on = checked.has(p.id);
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => toggle(p.id)} aria-pressed={on} disabled={!published}
                    className={`flex min-h-[58px] w-full items-center gap-3 border-b border-[var(--line-2)] px-3.5 py-2 text-left disabled:cursor-not-allowed ${on ? "bg-[#F1F8F4]" : "bg-white"}`}>
                    <span aria-hidden="true" className={`grid size-9 flex-none place-items-center rounded-full text-[13px] font-extrabold ${on ? "bg-[#E3F3E7] text-[#1B6B34]" : "bg-[#ECEEF4] text-[var(--ink-2)]"}`}>{initials(p.name)}</span>
                    <span className="flex-1 text-[15px] font-bold">{p.name}</span>
                    {saved.has(p.id) !== on && <span className="whitespace-nowrap rounded-full bg-[#FBEFD6] px-2 py-0.5 text-[11px] font-extrabold text-[#6F4304]">{on ? "Baru" : "Dibatalkan"}</span>}
                    <span aria-hidden="true" className={`grid size-7 flex-none place-items-center rounded-[9px] border-2 ${on ? "border-[#1E8A5A] bg-[#1E8A5A]" : "border-[#B9BDD1] bg-white"}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: on ? 1 : 0 }}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <Pager page={pg.page} pageSize={pg.pageSize} total={pg.total} onPage={pg.setPage} onPageSize={pg.setPageSize} noun="nama" />
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={!published} onClick={() => setGuest(true)}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-[#9AA0D6] bg-[#F6F7FE] text-sm font-bold text-[var(--primary-ink)] disabled:opacity-50 md:max-w-xs">
          <span aria-hidden="true">＋</span>Tamu belum ada di daftar
        </button>
        {dirty && <button type="button" onClick={reset} className="h-12 rounded-[14px] px-4 text-sm font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Buang perubahan</button>}
      </div>

      <SaveBar total={checked.size} dirty={dirty} saving={saving} disabled={!published} onSave={save} />
      {guest && <GuestDialog eventId={eventId} onClose={() => setGuest(false)} onAdded={(p) => { guestAdded(p, true); setGuest(false); }} onPick={(p) => { guestAdded(p, false); setGuest(false); }} />}
      {done && <SavedAfter message={done} onClose={() => setDone(null)} />}
    </>
  );
}

/** Tamu baru. Disimpan langsung sebagai orang baru (supaya namanya tidak dobel di kemudian hari). */
function GuestDialog({ eventId, onClose, onAdded, onPick }: { eventId: string; onClose: () => void; onAdded: (p: Person) => void; onPick: (p: Person) => void }) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"L" | "P">("L");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dups, setDups] = useState<Dup[]>([]);

  async function submit(confirmDuplicate = false) {
    setBusy(true); setErr("");
    const r = await callApi("POST", `/api/v1/events/${eventId}/attendance/guest`, { name: name.trim(), gender, ...(confirmDuplicate ? { confirmDuplicate: true } : {}) });
    setBusy(false);
    if (r.ok) { onAdded(r.data.person); return; }
    if (r.data?.error?.code === "DUPLICATE_PERSON") { setDups(r.data.error.details?.matches ?? []); return; }
    setErr(errMsg(r.data));
  }

  return (
    <Modal title="Tamu belum ada di daftar" onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className="h-11 rounded-xl border border-[#D0D3E8] bg-white px-4 text-sm font-bold text-[var(--primary-ink)]">Batal</button>
        {dups.length > 0
          ? <button type="button" disabled={busy} onClick={() => submit(true)} className="h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white disabled:opacity-50">Tetap tambah sebagai orang baru</button>
          : <button type="button" disabled={busy || name.trim().length === 0} onClick={() => submit()} className="h-11 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white disabled:opacity-50">{busy ? "Menyimpan…" : "Tambahkan tamu"}</button>}
      </>}>
      <div className="flex flex-col gap-4">
        {err && <Alert>{err}</Alert>}
        <Field label="Nama tamu"><input className={inputCls} value={name} maxLength={120} autoFocus onChange={(e) => { setName(e.target.value); setDups([]); }} /></Field>
        <div className="flex flex-col gap-1.5 text-[13px] font-bold">Jenis kelamin
          <div className="flex gap-2">
            {(["L", "P"] as const).map((g) => (
              <button key={g} type="button" onClick={() => setGender(g)} aria-pressed={gender === g}
                className={`h-11 flex-1 rounded-xl border text-sm font-bold ${gender === g ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-ink)]" : "border-[var(--line)] bg-white text-[var(--ink-2)]"}`}>{g === "L" ? "Laki-laki" : "Perempuan"}</button>
            ))}
          </div>
        </div>
        {dups.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-[#EBDDB8] bg-[#FFFDF7] p-3.5">
            <span className="text-[13px] font-extrabold text-[#6F4304]">Sudah ada nama yang mirip. Apakah orangnya sama?</span>
            {dups.map((d) => (
              <div key={d.id} className="flex items-center gap-3 rounded-lg bg-white px-3 py-2">
                <span className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-bold">{d.name}</span><span className="text-xs font-medium text-[var(--ink-2)]">{d.position}{d.birthDate ? ` · lahir ${d.birthDate}` : ""}</span></span>
                <button type="button" onClick={() => onPick({ id: d.id, name: d.name })} className="h-9 rounded-lg bg-[var(--primary-soft)] px-3 text-[13px] font-bold text-[var(--primary-ink)]">Ini orangnya</button>
              </div>
            ))}
          </div>
        )}
        <p className="m-0 text-xs font-medium text-[var(--ink-2)]">Tamu langsung disimpan sebagai orang baru dan ditandai hadir, tanpa menunggu tombol simpan.</p>
      </div>
    </Modal>
  );
}
