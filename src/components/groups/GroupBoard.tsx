"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { askConfirm } from "@/components/ui/Confirm";
import Modal, { Field } from "@/components/master/Modal";
import NewPersonInline from "@/components/master/NewPersonInline";
import { btnGhost, btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";
import { FilterBar, FSearch, FSelect } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import { useClientPaging } from "@/components/ui/usePagedList";

export const NEW_GROUP_EVENT = "groups:new";

type GroupRow = { id: string; name: string; quorumMin: number | null; memberCount: number; positionCount: number };
type Position = { id: string; name: string; canSchedule: boolean; canWriteMinutes: boolean; canFinalize: boolean; canManageMembers: boolean };
type Member = { id: string; personId: string; name: string; title: string | null; positionIds: string[] };
type Detail = { id: string; name: string; quorumMin: number | null; canAdmin: boolean; canManageMembers: boolean; positions: Position[]; members: Member[] };
type PersonHit = { id: string; name: string; title: string | null };

const CAPS: { key: keyof Omit<Position, "id" | "name">; head: string; label: string; hint: string }[] = [
  { key: "canSchedule", head: "JADWALKAN RAPAT", label: "Menjadwalkan rapat", hint: "Membuat dan mengubah rapat kelompok, termasuk meminjam ruangan." },
  { key: "canWriteMinutes", head: "TULIS NOTULEN", label: "Menulis notulen", hint: "Mengisi agenda, pembahasan, keputusan, dan kehadiran." },
  { key: "canFinalize", head: "FINALKAN", label: "Memfinalkan notulen", hint: "Mengunci notulen menjadi Final." },
  { key: "canManageMembers", head: "KELOLA ANGGOTA", label: "Mengelola anggota", hint: "Menambah, mengeluarkan, dan mengubah jabatan anggota." },
];

const fullName = (p: { name: string; title: string | null }) => (p.title ? `${p.title} ${p.name}` : p.name);
const quorumText = (q: number | null) => (q ? `Kuorum ${q}%` : "Tanpa kuorum");
const eyebrow = "text-xs font-extrabold tracking-[0.07em] text-[var(--gold-ink)]";
const cardCls = "rounded-[20px] border border-[var(--line)] bg-white";

function Rule({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2.5"><span className={eyebrow}>{children}</span><span className="h-px flex-1 bg-[#e8e4d6]" /></div>;
}

export default function GroupBoard({ isSuperadmin, canAddPerson }: { isSuperadmin: boolean; canAddPerson: boolean }) {
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [modal, setModal] = useState<null | { t: "group"; create: boolean } | { t: "position"; pos: Position | null } | { t: "add" } | { t: "member"; m: Member }>(null);
  const [picker, setPicker] = useState(false); // HP: daftar kelompok dilipat ke dalam kartu detail

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    void callApi("GET", "/api/v1/groups").then((r) => {
      if (!live) return;
      if (!r.ok) { setError(errMsg(r.data)); return; }
      setError("");
      setGroups(r.data.items);
      setSel((cur) => (cur && r.data.items.some((g: GroupRow) => g.id === cur) ? cur : r.data.items[0]?.id ?? null));
    });
    return () => { live = false; };
  }, [version]);

  useEffect(() => {
    if (!sel) { setDetail(null); return; }
    let live = true;
    void callApi("GET", `/api/v1/groups/${sel}`).then((r) => {
      if (!live) return;
      if (r.ok) { setDetail(r.data); setError(""); } else setError(errMsg(r.data));
    });
    return () => { live = false; };
  }, [sel, version]);

  useEffect(() => {
    const open = () => setModal({ t: "group", create: true });
    window.addEventListener(NEW_GROUP_EVENT, open);
    return () => window.removeEventListener(NEW_GROUP_EVENT, open);
  }, []);

  const done = () => { setModal(null); reload(); };
  const posName = (id: string) => detail?.positions.find((p) => p.id === id)?.name ?? "";

  return (
    <>
      <div className="flex items-center gap-3.5 rounded-[14px] border border-[#d0d3e8] bg-[#f1f2fd] px-[18px] py-3.5">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2A2F8F" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none"><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
        <span className="text-[13.5px] font-semibold leading-relaxed text-[var(--primary-ink)]">
          {isSuperadmin
            ? <>Isi rapat (notulen dan tautan dokumen) hanya terbaca oleh anggota kelompok. Anda melihat halaman ini sebagai <b>Superadmin</b>: bisa mengatur kelompok, jabatan, dan anggota, tetapi tidak bisa membaca notulen. Setiap perubahan tercatat di Log aktivitas.</>
            : <>Isi rapat (notulen dan tautan dokumen) hanya terbaca oleh anggota kelompok. Di sini Anda hanya melihat kelompok yang Anda ikuti.</>}
        </span>
      </div>

      {error && <div role="alert" className="rounded-xl border border-[#f0c7c7] bg-[#fdf1f1] px-4 py-3 text-sm font-semibold text-[#9b1c1c]">{error}</div>}

      {groups && groups.length === 0 && (
        <div className={`${cardCls} p-10 text-center text-sm font-semibold text-[var(--ink-2)]`}>
          Belum ada kelompok.{isSuperadmin ? " Klik “Kelompok baru” untuk membuat yang pertama, misalnya Majelis." : ""}
        </div>
      )}

      {groups && groups.length > 0 && (
        <div className="flex flex-wrap items-start gap-5">
          {/* Daftar kelompok */}
          <section className={`${cardCls} min-w-[260px] flex-[0_1_300px] overflow-hidden max-md:hidden`}>
            <div className="border-b border-[var(--line)] px-[18px] py-4 text-xs font-extrabold tracking-[0.06em] text-[var(--ink-2)]">DAFTAR KELOMPOK</div>
            {groups.map((g) => {
              const on = g.id === sel;
              return (
                <button key={g.id} type="button" onClick={() => setSel(g.id)} aria-current={on ? "true" : undefined}
                  className={`flex w-full items-center justify-between gap-3 border-b border-[var(--line-2)] px-[18px] py-3.5 text-left ${on ? "bg-[#f1f2fd]" : "hover:bg-[#f6f7fe]"}`}>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={`truncate text-[14.5px] font-extrabold ${on ? "text-[var(--primary-ink)]" : ""}`}>{g.name}</span>
                    <span className="text-[12.5px] font-medium text-[var(--ink-2)]">{g.positionCount} jabatan</span>
                  </span>
                  <span className={`grid h-7 min-w-7 flex-none place-items-center rounded-full px-2 text-[12.5px] font-extrabold ${on ? "bg-[var(--primary)] text-white" : "bg-[#eceef4] text-[#3a3f58]"}`}>{g.memberCount}</span>
                </button>
              );
            })}
            {isSuperadmin && <div className="px-[18px] py-3.5 text-[12.5px] font-medium leading-relaxed text-[var(--ink-2)]">Kelompok baru bisa ditambah kapan saja, begitu juga jabatannya.</div>}
          </section>

          {/* Detail */}
          {detail && (
            <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
              <div className={`${cardCls} flex flex-col gap-[18px] px-6 py-[22px]`}>
                <div className="flex items-start justify-between gap-3 md:flex-wrap md:items-center">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <h2 className="text-[22px] font-extrabold tracking-tight max-md:hidden">{detail.name}</h2>
                    {/* HP: nama kelompok sekaligus pemilih kelompok */}
                    <h2 className="md:hidden">
                      <button type="button" onClick={() => setPicker((v) => !v)} aria-expanded={picker} aria-label={`Kelompok ${detail.name}. Ganti kelompok`}
                        className="-mx-2 flex max-w-full items-center gap-1.5 rounded-xl px-2 py-1 text-left active:bg-[var(--bg)]">
                        <span className="truncate text-[22px] font-extrabold tracking-tight">{detail.name}</span>
                        <svg viewBox="0 0 12 12" className={`size-3.5 flex-none text-[var(--ink-2)] transition-transform ${picker ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 4.5L6 8l3.5-3.5" /></svg>
                      </button>
                    </h2>
                    <span className="text-[13.5px] font-semibold text-[var(--ink-2)]">{detail.members.length} anggota · {detail.positions.length} jabatan · {quorumText(detail.quorumMin)}</span>
                  </div>
                  {detail.canAdmin && (
                    <button type="button" onClick={() => setModal({ t: "group", create: false })} className="h-10 flex-none whitespace-nowrap rounded-xl border border-[#d0d3e8] bg-white px-4 text-[13.5px] font-bold text-[var(--primary-ink)] hover:bg-[#f3f4f9] max-md:h-9 max-md:px-3.5">
                      <span className="max-md:hidden">Ubah nama &amp; kuorum</span><span className="md:hidden">Ubah</span>
                    </button>
                  )}
                </div>

                {picker && groups && (
                  <ul className="-mt-2 flex flex-col overflow-hidden rounded-xl border border-[var(--line)] md:hidden" aria-label="Pilih kelompok">
                    {groups.map((g) => {
                      const on = g.id === sel;
                      return (
                        <li key={g.id} className="border-b border-[var(--line-2)] last:border-b-0">
                          <button type="button" aria-current={on ? "true" : undefined} onClick={() => { setSel(g.id); setPicker(false); }}
                            className={`flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left ${on ? "bg-[#f1f2fd]" : "active:bg-[#f6f7fe]"}`}>
                            <span className="flex min-w-0 flex-col">
                              <span className={`truncate text-sm font-extrabold ${on ? "text-[var(--primary-ink)]" : ""}`}>{g.name}</span>
                              <span className="text-xs font-medium text-[var(--ink-2)]">{g.memberCount} anggota · {g.positionCount} jabatan</span>
                            </span>
                            {on && <svg viewBox="0 0 12 12" className="size-4 flex-none text-[var(--primary)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.5 6.2l2.4 2.4 4.6-5" /></svg>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <Rule>JABATAN DAN HAKNYA</Rule>
                {/* HP: satu baris per jabatan, hak ditampilkan sebagai chip (tanpa geser kiri-kanan) */}
                <ul className="-mt-1 flex flex-col md:hidden">
                  {detail.positions.map((p) => {
                    const granted = CAPS.filter((c) => p[c.key]);
                    return (
                      <li key={p.id} className="flex items-start justify-between gap-3 border-b border-[var(--line-2)] py-3 last:border-b-0">
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <span className="text-sm font-bold">{p.name}</span>
                          <span className="flex flex-wrap gap-1.5">
                            {granted.length === 0
                              ? <span className="text-xs font-medium text-[var(--ink-2)]">Tanpa hak khusus</span>
                              : granted.map((c) => <span key={c.key} className="whitespace-nowrap rounded-full bg-[#e3f3e7] px-2.5 py-[3px] text-xs font-bold text-[#1b6b34]">{c.label.replace(/^(Menjadwalkan|Menulis|Memfinalkan|Mengelola)/, (m) => ({ Menjadwalkan: "Jadwalkan", Menulis: "Tulis", Memfinalkan: "Finalkan", Mengelola: "Kelola" } as Record<string, string>)[m])}</span>)}
                          </span>
                        </div>
                        {detail.canAdmin && <button type="button" onClick={() => setModal({ t: "position", pos: p })} className="h-8 flex-none rounded-lg border border-[var(--line)] bg-white px-3 text-xs font-semibold text-[var(--ink-2)] active:bg-[var(--bg)]">Ubah</button>}
                      </li>
                    );
                  })}
                </ul>
                <div className="overflow-x-auto max-md:hidden">
                  <div className="flex min-w-[600px] flex-col">
                    <div className="grid grid-cols-[1.5fr_repeat(4,1fr)_64px] gap-2.5 rounded-[10px] bg-[var(--surface-2)] px-3.5 py-2.5 text-xs font-extrabold tracking-[0.03em] text-[var(--ink-2)]">
                      <span>JABATAN</span>{CAPS.map((c) => <span key={c.key}>{c.head}</span>)}<span />
                    </div>
                    {detail.positions.map((p) => (
                      <div key={p.id} className="grid grid-cols-[1.5fr_repeat(4,1fr)_64px] items-center gap-2.5 border-b border-[var(--line-2)] px-3.5 py-[11px] text-sm">
                        <span className="font-bold">{p.name}</span>
                        {CAPS.map((c) => (
                          <span key={c.key} className={`min-w-11 justify-self-start rounded-full px-3 py-[3px] text-center text-[12.5px] font-bold ${p[c.key] ? "bg-[#e3f3e7] text-[#1b6b34]" : "bg-[var(--bg)] text-[var(--ink-2)]"}`}>{p[c.key] ? "Ya" : "–"}</span>
                        ))}
                        {detail.canAdmin ? <button type="button" onClick={() => setModal({ t: "position", pos: p })} className="h-8 rounded-lg border border-[var(--line)] bg-white text-xs font-semibold text-[var(--ink-2)] hover:bg-[var(--bg)]">Ubah</button> : <span />}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {detail.canAdmin && <button type="button" onClick={() => setModal({ t: "position", pos: null })} className="h-9 rounded-full border-[1.5px] border-dashed border-[#9aa0d6] bg-[#f6f7fe] px-3.5 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[#eceefd]">+ jabatan</button>}
                  <span className="text-[12.5px] font-medium text-[var(--ink-2)]">Orang yang merangkap jabatan mendapat gabungan haknya.</span>
                </div>
              </div>

              <div className={`${cardCls} flex flex-col gap-3.5 px-6 py-[22px]`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-[200px] flex-1 items-center gap-2.5"><span className={eyebrow}>ANGGOTA</span><span className="h-px flex-1 bg-[#e8e4d6]" /></div>
                  {detail.canManageMembers && <button type="button" onClick={() => setModal({ t: "add" })} className="flex h-10 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-[13.5px] font-bold text-white hover:brightness-110">＋ Tambah anggota</button>}
                </div>
                <MemberList detail={detail} posName={posName} onEdit={(m) => setModal({ t: "member", m })} />
                <span className="text-[12.5px] font-medium leading-relaxed text-[var(--ink-2)]">Anggota yang keluar tidak lagi bisa membuka notulen, tetapi riwayat keanggotaannya tetap tersimpan.</span>
              </div>
            </section>
          )}
        </div>
      )}

      {modal?.t === "group" && <GroupDialog create={modal.create} detail={modal.create ? null : detail} onClose={() => setModal(null)} onDone={(id) => { if (id) setSel(id); done(); }} />}
      {modal?.t === "position" && detail && <PositionDialog groupId={detail.id} pos={modal.pos} onClose={() => setModal(null)} onDone={done} />}
      {modal?.t === "add" && detail && <AddMemberDialog detail={detail} canAddPerson={canAddPerson} onClose={() => setModal(null)} onDone={done} />}
      {modal?.t === "member" && detail && <MemberDialog detail={detail} member={modal.m} onClose={() => setModal(null)} onDone={done} />}
    </>
  );
}

/** Anggota kelompok: cari nama, saring per jabatan, dan berhalaman (kelompok seperti Majelis bisa puluhan orang). */
function MemberList({ detail, posName, onEdit }: { detail: Detail; posName: (id: string) => string; onEdit: (m: Member) => void }) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("");
  const shown = useMemo(
    () => detail.members.filter((m) => (!q.trim() || fullName(m).toLowerCase().includes(q.trim().toLowerCase())) && (!pos || (pos === "NONE" ? m.positionIds.length === 0 : m.positionIds.includes(pos)))),
    [detail.members, q, pos],
  );
  const pg = useClientPaging(shown);
  if (detail.members.length === 0) return <p className="py-4 text-sm font-medium text-[var(--ink-2)]">Belum ada anggota.</p>;
  return (
    <>
      <FilterBar surface="card" active={!!(q || pos)} onReset={() => { setQ(""); setPos(""); }}>
        <FSearch label="Cari anggota" value={q} onChange={setQ} placeholder="Nama anggota" />
        <FSelect label="Jabatan" value={pos} onChange={setPos} allLabel="Semua jabatan" width="w-48">
          {detail.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="NONE">Belum ada jabatan</option>
        </FSelect>
      </FilterBar>
      <div className="overflow-x-auto">
        <div className="flex min-w-[520px] flex-col">
          {shown.length === 0 && <p className="py-4 text-sm font-semibold text-[var(--ink-2)]">Tidak ada anggota yang cocok dengan filter ini.</p>}
          {pg.slice.map((m) => (
            <div key={m.id} className="grid grid-cols-[2fr_3fr_auto] items-center gap-3 border-b border-[var(--line-2)] py-2.5">
              <span className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 flex-none place-items-center rounded-full bg-[var(--primary-soft)] text-[13px] font-extrabold text-[var(--primary-ink)]" aria-hidden="true">{m.name.charAt(0).toUpperCase()}</span>
                <span className="truncate text-sm font-bold">{fullName(m)}</span>
              </span>
              <span className="flex flex-wrap gap-1.5">
                {m.positionIds.length === 0 && <span className="text-[12.5px] font-medium text-[var(--ink-2)]">Belum ada jabatan</span>}
                {m.positionIds.map((pid) => <span key={pid} className="whitespace-nowrap rounded-full bg-[var(--gold-soft)] px-[11px] py-[3px] text-[12.5px] font-bold text-[#6f4304]">{posName(pid)}</span>)}
              </span>
              {detail.canManageMembers ? <button type="button" onClick={() => onEdit(m)} className="h-[34px] rounded-[10px] border border-[var(--line)] bg-white px-3 text-[12.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--bg)]">Ubah jabatan</button> : <span />}
            </div>
          ))}
        </div>
      </div>
      {shown.length > 0 && <Pager className="rounded-xl border" page={pg.page} pageSize={pg.pageSize} total={pg.total} onPage={pg.setPage} onPageSize={pg.setPageSize} noun="anggota" />}
    </>
  );
}

function ErrorLine({ text }: { text: string }) {
  return text ? <p role="alert" className="mt-4 rounded-xl border border-[#f0c7c7] bg-[#fdf1f1] px-3.5 py-2.5 text-sm font-semibold text-[#9b1c1c]">{text}</p> : null;
}

/** Buat kelompok baru, atau ubah nama dan kuorum. */
function GroupDialog({ create, detail, onClose, onDone }: { create: boolean; detail: Detail | null; onClose: () => void; onDone: (newId?: string) => void }) {
  const [name, setName] = useState(detail?.name ?? "");
  const [useQuorum, setUseQuorum] = useState(!!detail?.quorumMin);
  const [pct, setPct] = useState(String(detail?.quorumMin ?? 50));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setBusy(true); setErr("");
    const body = { name: name.trim(), quorumMin: useQuorum ? Number(pct) : null };
    const r = create ? await callApi("POST", "/api/v1/groups", body) : await callApi("PATCH", `/api/v1/groups/${detail!.id}`, body);
    setBusy(false);
    if (r.ok) onDone(create ? r.data.id : undefined); else setErr(errMsg(r.data));
  };
  const remove = async () => {
    if (!detail || !(await askConfirm(`Hapus kelompok ${detail.name}? Anggota dan jabatannya tidak akan tampil lagi.`))) return;
    setBusy(true);
    const r = await callApi("DELETE", `/api/v1/groups/${detail.id}`);
    setBusy(false);
    if (r.ok) onDone(); else setErr(errMsg(r.data));
  };

  return (
    <Modal title={create ? "Kelompok baru" : "Ubah nama & kuorum"} onClose={onClose}
      footer={<>
        {!create && <button type="button" onClick={remove} disabled={busy} className="mr-auto h-11 rounded-xl px-3 text-sm font-bold text-[#9b1c1c] hover:bg-[#fdf1f1] disabled:opacity-50">Hapus kelompok</button>}
        <button type="button" onClick={onClose} className={btnGhost}>Batal</button>
        <button type="button" onClick={save} disabled={busy || !name.trim()} className={btnPrimary}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </>}>
      <div className="flex flex-col gap-4">
        <Field label="Nama kelompok"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Mis. Majelis, Pengurus Pemuda, Tim EBM" className={inputCls} autoFocus /></Field>
        <div className="flex flex-col gap-2.5 rounded-xl border border-[var(--line)] p-3.5">
          <label className="flex items-center gap-2.5 text-sm font-bold">
            <input type="checkbox" checked={useQuorum} onChange={(e) => setUseQuorum(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Pakai kuorum
          </label>
          <span className="text-xs font-medium text-[var(--ink-2)]">Rapat dianggap sah bila persentase anggota yang hadir mencapai batas ini. Dihitung di notulen.</span>
          {useQuorum && (
            <label className="flex items-center gap-2 text-sm font-bold">
              Minimal hadir
              <input type="number" min={1} max={100} value={pct} onChange={(e) => setPct(e.target.value)} className={`${inputCls} !w-24`} />
              <span>%</span>
            </label>
          )}
        </div>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

/** Tambah atau ubah satu jabatan beserta haknya. */
function PositionDialog({ groupId, pos, onClose, onDone }: { groupId: string; pos: Position | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(pos?.name ?? "");
  const [caps, setCaps] = useState({ canSchedule: pos?.canSchedule ?? false, canWriteMinutes: pos?.canWriteMinutes ?? false, canFinalize: pos?.canFinalize ?? false, canManageMembers: pos?.canManageMembers ?? false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setBusy(true); setErr("");
    const body = { name: name.trim(), ...caps };
    const r = pos ? await callApi("PATCH", `/api/v1/groups/${groupId}/positions/${pos.id}`, body) : await callApi("POST", `/api/v1/groups/${groupId}/positions`, body);
    setBusy(false);
    if (r.ok) onDone(); else setErr(errMsg(r.data));
  };
  const remove = async () => {
    if (!pos || !(await askConfirm(`Hapus jabatan ${pos.name}? Jabatan ini dicabut dari semua anggota dan hak mereka ikut hilang.`))) return;
    setBusy(true);
    const r = await callApi("DELETE", `/api/v1/groups/${groupId}/positions/${pos.id}`);
    setBusy(false);
    if (r.ok) onDone(); else setErr(errMsg(r.data));
  };

  return (
    <Modal title={pos ? `Ubah jabatan ${pos.name}` : "Jabatan baru"} onClose={onClose}
      footer={<>
        {pos && <button type="button" onClick={remove} disabled={busy} className="mr-auto h-11 rounded-xl px-3 text-sm font-bold text-[#9b1c1c] hover:bg-[#fdf1f1] disabled:opacity-50">Hapus jabatan</button>}
        <button type="button" onClick={onClose} className={btnGhost}>Batal</button>
        <button type="button" onClick={save} disabled={busy || !name.trim()} className={btnPrimary}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </>}>
      <div className="flex flex-col gap-4">
        <Field label="Nama jabatan"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Mis. Ketua, Sekretaris, Penjadwal" className={inputCls} autoFocus /></Field>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-bold">Hak jabatan ini</span>
          {CAPS.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-start gap-3 rounded-xl px-1 py-2 hover:bg-[var(--surface-2)]">
              <input type="checkbox" checked={caps[c.key]} onChange={(e) => setCaps({ ...caps, [c.key]: e.target.checked })} className="mt-0.5 size-4 flex-none accent-[var(--primary)]" />
              <span className="flex flex-col"><span className="text-sm font-bold">{c.label}</span><span className="text-xs font-medium text-[var(--ink-2)]">{c.hint}</span></span>
            </label>
          ))}
          <span className="mt-1 text-xs font-medium text-[var(--ink-2)]">Membaca notulen selalu boleh untuk semua anggota kelompok.</span>
        </div>
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

function PositionChecks({ positions, value, onChange }: { positions: Position[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] font-bold">Jabatan</span>
      {positions.map((p) => (
        <label key={p.id} className="flex cursor-pointer items-center gap-3 rounded-xl px-1 py-1.5 hover:bg-[var(--surface-2)]">
          <input type="checkbox" checked={value.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...value, p.id] : value.filter((x) => x !== p.id))} className="size-4 accent-[var(--primary)]" />
          <span className="text-sm font-bold">{p.name}</span>
        </label>
      ))}
      <span className="text-xs font-medium text-[var(--ink-2)]">Boleh lebih dari satu. Haknya digabung.</span>
    </div>
  );
}

/** Cari orang lalu jadikan anggota. Bila namanya belum ada, bisa langsung ditambahkan sebagai orang baru. */
function AddMemberDialog({ detail, canAddPerson, onClose, onDone }: { detail: Detail; canAddPerson: boolean; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PersonHit[]>([]);
  const [searched, setSearched] = useState(false); // true setelah hasil untuk q terakhir tiba
  const [picked, setPicked] = useState<PersonHit | null>(null);
  const [creating, setCreating] = useState(false);
  const defaultPos = detail.positions.find((p) => p.name === "Anggota")?.id;
  const [positionIds, setPositionIds] = useState<string[]>(defaultPos ? [defaultPos] : []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const taken = new Set(detail.members.map((m) => m.personId));
  const shown = hits.filter((h) => !taken.has(h.id));

  useEffect(() => {
    if (picked) return;
    let live = true;
    setSearched(false);
    const t = setTimeout(async () => {
      const r = await callApi("GET", `/api/v1/persons?limit=20&search=${encodeURIComponent(q.trim())}`);
      if (live && r.ok) { setHits(r.data.items); setSearched(true); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, picked]);

  const save = async () => {
    if (!picked) return;
    setBusy(true); setErr("");
    const r = await callApi("POST", `/api/v1/groups/${detail.id}/members`, { personId: picked.id, positionIds });
    setBusy(false);
    if (r.ok) onDone(); else setErr(errMsg(r.data));
  };

  return (
    <Modal title={`Tambah anggota ${detail.name}`} onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Batal</button>
        <button type="button" onClick={save} disabled={busy || !picked} className={btnPrimary}>{busy ? "Menyimpan…" : "Tambahkan"}</button>
      </>}>
      <div className="flex flex-col gap-4">
        {!picked ? (
          <>
            <Field label="Cari nama"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik nama jemaat" className={inputCls} autoFocus /></Field>
            <div className="flex max-h-64 flex-col overflow-y-auto rounded-xl border border-[var(--line)]">
              {shown.map((h) => (
                <button key={h.id} type="button" onClick={() => setPicked(h)} className="border-b border-[var(--line-2)] px-3.5 py-2.5 text-left text-sm font-bold last:border-b-0 hover:bg-[#f6f7fe]">{fullName(h)}</button>
              ))}
              {shown.length === 0 && <span className="px-3.5 py-3 text-sm font-medium text-[var(--ink-2)]">{searched ? "Tidak ada nama yang cocok." : "Mencari…"}</span>}
            </div>
            {canAddPerson && (creating
              ? <NewPersonInline initialName={q.trim()} onCancel={() => setCreating(false)} onCreated={(p) => { setPicked({ id: p.id, name: p.name, title: p.title }); setCreating(false); }} />
              : <button type="button" onClick={() => setCreating(true)} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#B9BDDA] text-sm font-bold text-[var(--primary-ink)] hover:bg-white">
                  ＋ Tambah orang baru{q.trim() ? ` “${q.trim()}”` : ""}
                </button>)}
            {!canAddPerson && searched && q.trim() && shown.length === 0 && (
              <span className="text-xs font-medium text-[var(--ink-2)]">Nama ini belum ada di data orang. Minta admin yang mengelola data orang untuk menambahkannya dulu.</span>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--primary)] bg-[#f1f2fd] px-3.5 py-2.5">
              <span className="text-sm font-extrabold text-[var(--primary-ink)]">{fullName(picked)}</span>
              <button type="button" onClick={() => setPicked(null)} className="text-xs font-bold text-[var(--ink-2)] hover:underline">Ganti</button>
            </div>
            <PositionChecks positions={detail.positions} value={positionIds} onChange={setPositionIds} />
          </>
        )}
      </div>
      <ErrorLine text={err} />
    </Modal>
  );
}

/** Ubah jabatan seorang anggota, atau keluarkan dari kelompok. */
function MemberDialog({ detail, member, onClose, onDone }: { detail: Detail; member: Member; onClose: () => void; onDone: () => void }) {
  const [positionIds, setPositionIds] = useState<string[]>(member.positionIds);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setBusy(true); setErr("");
    const r = await callApi("PATCH", `/api/v1/groups/${detail.id}/members/${member.id}`, { positionIds });
    setBusy(false);
    if (r.ok) onDone(); else setErr(errMsg(r.data));
  };
  const remove = async () => {
    if (!(await askConfirm(`Keluarkan ${fullName(member)} dari ${detail.name}? Ia tidak bisa membuka isi rapat lagi.`))) return;
    setBusy(true);
    const r = await callApi("DELETE", `/api/v1/groups/${detail.id}/members/${member.id}`);
    setBusy(false);
    if (r.ok) onDone(); else setErr(errMsg(r.data));
  };

  return (
    <Modal title={fullName(member)} onClose={onClose}
      footer={<>
        <button type="button" onClick={remove} disabled={busy} className="mr-auto h-11 rounded-xl px-3 text-sm font-bold text-[#9b1c1c] hover:bg-[#fdf1f1] disabled:opacity-50">Keluarkan dari kelompok</button>
        <button type="button" onClick={onClose} className={btnGhost}>Batal</button>
        <button type="button" onClick={save} disabled={busy} className={btnPrimary}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </>}>
      <PositionChecks positions={detail.positions} value={positionIds} onChange={setPositionIds} />
      <ErrorLine text={err} />
    </Modal>
  );
}
