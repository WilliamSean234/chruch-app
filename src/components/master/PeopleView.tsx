"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LookupManager, { type LookupKind } from "./LookupManager";
import MinistryManager from "./MinistryManager";
import Modal from "./Modal";
import PersonForm, { type CgOpt, type Lookups, type Opt, type PersonDto, type Team } from "./PersonForm";
import { btnGhost, btnPrimary, callApi, errMsg } from "@/components/jadwal/api";
import { Alert, FilterBar, FNumber, FSearch, FSelect } from "@/components/ui/Filters";
import { askConfirm } from "@/components/ui/Confirm";
import { showToast } from "@/components/ui/Toast";
import MembershipChips from "@/components/ui/MembershipChips";
import Pager from "@/components/ui/Pager";
import { CompactList, CompactRow, Detail, useOpenRows } from "@/components/ui/CompactList";
import { useDebounced, usePagedList } from "@/components/ui/usePagedList";
import { initials, ROLE_LABEL } from "@/lib/ui";

export const NEW_PERSON_EVENT = "people:new";
const PICKLISTS: Record<Exclude<LookupKind, "rooms">, { title: string; singular: string; hint: string }> = {
  positions: { title: "Posisi di gereja", singular: "Posisi", hint: "Mis. Jemaat, Pendeta, Pembina pemuda. Dipakai untuk mengelompokkan orang." },
  "cg-groups": { title: "Kelompok CG", singular: "Kelompok CG", hint: "Kelompok sel / komsel tempat jemaat bernaung." },
  communities: { title: "Komunitas", singular: "Komunitas", hint: "Mis. Pemuda, Young couple, Anak-anak. Komunitas juga dipakai untuk daftar hadir per nama." },
};
const birthText = (iso: string | null) => (iso ? new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T00:00:00Z`)) : "—");

/** Nama lengkap dengan gelar; tidak menggandakan gelar bila sudah tertulis di nama. */
const fullName = (x: { name: string; title?: string | null }) => (x.title && !x.name.toLowerCase().startsWith(x.title.toLowerCase()) ? `${x.title} ${x.name}` : x.name);
// Warna posisi khusus (selain "Jemaat"): tetap per nama posisi, hijau dipakai khusus untuk Leader CG.
const POS_COLORS = [["#E6E8F8", "#3037A8"], ["#FFF3D6", "#6F4304"], ["#FCE8EC", "#9B1C3A"], ["#DDF3F2", "#0F5E5A"], ["#EFE6FA", "#5B2A9E"]] as const;
const posColor = (name: string) => POS_COLORS[[...name.toLowerCase()].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % POS_COLORS.length];
const ROLE_TONE: Record<string, [string, string]> = {
  SUPERADMIN: ["#FCE8EC", "#9B1C3A"], PENJADWAL: ["#E6E8F8", "#3037A8"], ADMIN_TIM: ["#EFE6FA", "#5B2A9E"], PETUGAS_ABSEN: ["#FFF3D6", "#6F4304"], PELAYAN: ["#E3F4E8", "#1B6B34"], PENGAWAS: ["#DDF3F2", "#0F5E5A"],
};
const ROLE_ORDER = ["SUPERADMIN", "PENGAWAS", "PENJADWAL", "ADMIN_TIM", "PETUGAS_ABSEN", "PELAYAN"];

/** Role akun login: chip per role. Tanpa akun cukup "–"; akun nonaktif diberi tanda. */
function RoleChips({ account }: { account: PersonDto["account"] }) {
  if (!account) return <span className="text-[var(--ink-2)]">–</span>;
  const codes = [...(account.roleCodes ?? [])].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {codes.length === 0 && <span className="whitespace-nowrap rounded-full bg-[#ECEEF4] px-2.5 py-0.5 text-xs font-bold text-[#565B76]">Tanpa role</span>}
      {codes.map((c) => <span key={c} className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: (ROLE_TONE[c] ?? ROLE_TONE.PELAYAN)[0], color: (ROLE_TONE[c] ?? ROLE_TONE.PELAYAN)[1] }}>{ROLE_LABEL[c] ?? c}</span>)}
      {!account.isActive && <span className="whitespace-nowrap rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] font-bold text-[var(--ink-2)]">Nonaktif</span>}
    </span>
  );
}
const isPlainPosition = (name: string) => name.trim().toLowerCase() === "jemaat";

export default function PeopleView({ scope, canAccount, canMaster, isSuper, canGroups }: { scope: string[] | null; canAccount: boolean; canMaster: boolean; isSuper: boolean; canGroups: boolean }) {
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [q, setQ] = useState("");
  const [ministryId, setMinistryId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [commId, setCommId] = useState("");
  const [roleF, setRoleF] = useState("");
  const [cgId, setCgId] = useState("");
  const [gender, setGender] = useState("");
  const [origin, setOrigin] = useState("");
  const [groupId, setGroupId] = useState("");
  const [groups, setGroups] = useState<Opt[]>([]);
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [selId, setSelId] = useState<string | null>(null);
  const rows = useOpenRows(); // HP: baris orang yang dibuka
  const [sheetId, setSheetId] = useState<string | null>(null); // HP: detail orang dibuka sebagai dialog
  const [form, setForm] = useState<{ person: PersonDto | null } | null>(null);
  const [manage, setManage] = useState<null | "ministry" | keyof typeof PICKLISTS>(null);

  const loadLookups = useCallback(async () => {
    const [p, c, m, t] = await Promise.all([
      callApi("GET", "/api/v1/lookups/positions"), callApi("GET", "/api/v1/lookups/cg-groups"),
      callApi("GET", "/api/v1/lookups/communities"), callApi("GET", "/api/v1/teams"),
    ]);
    const byName = (a: Opt, b: Opt) => a.name.localeCompare(b.name);
    if (p.ok && c.ok && m.ok && t.ok) setLookups({ positions: (p.data.items as Opt[]).sort(byName), cgs: (c.data.items as CgOpt[]).sort(byName), communities: (m.data.items as Opt[]).sort(byName), teams: t.data.items as Team[] });
  }, []);
  useEffect(() => { void loadLookups(); }, [loadLookups]);
  // kelompok rapat: keanggotaannya hanya terlihat oleh Superadmin
  useEffect(() => { if (canGroups) void callApi("GET", "/api/v1/groups?untuk=orang").then((r) => { if (r.ok) setGroups(r.data.items as Opt[]); }); }, [canGroups]);

  const search = useDebounced(q.trim());
  const dAgeMin = useDebounced(ageMin, 500);
  const dAgeMax = useDebounced(ageMax, 500);
  const list = usePagedList<PersonDto>("/api/v1/persons", {
    search, ministryId, positionId, communityId: commId, role: roleF, cgGroupId: cgId, gender, origin, ageMin: dAgeMin, ageMax: dAgeMax, groupId,
  });
  const { items, total, error } = list;
  const reload = list.reload;
  const dirty = !!(q || ministryId || positionId || commId || roleF || cgId || gender || origin || ageMin || ageMax || groupId);
  const resetFilters = () => { setQ(""); setMinistryId(""); setPositionId(""); setCommId(""); setRoleF(""); setCgId(""); setGender(""); setOrigin(""); setAgeMin(""); setAgeMax(""); setGroupId(""); };

  useEffect(() => {
    const open = () => setForm({ person: null });
    window.addEventListener(NEW_PERSON_EVENT, open);
    return () => window.removeEventListener(NEW_PERSON_EVENT, open);
  }, []);

  // Siapa leader CG mana (dari daftar CG yang memuat leader-nya).
  const leaderOf = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of lookups?.cgs ?? []) for (const l of c.leaders ?? []) m.set(l.id, [...(m.get(l.id) ?? []), c.name]);
    return m;
  }, [lookups]);

  // Header tabel menempel tepat di bawah bar filter (tingginya berubah saat "Filter lainnya" dibuka), dan hanya selama tabelnya masih terlihat.
  const barRef = useRef<HTMLDivElement>(null);
  const headScroll = useRef<HTMLDivElement>(null);
  const [headTop, setHeadTop] = useState(0);
  useEffect(() => {
    const el = barRef.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    const calc = () => setHeadTop(Math.round((parseFloat(getComputedStyle(el).top) || 0) + el.getBoundingClientRect().height));
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    window.addEventListener("resize", calc);
    return () => { ro.disconnect(); window.removeEventListener("resize", calc); };
  }, []);
  const cols = useMemo(() => [
    { h: "Nama", w: 230 }, { h: "Posisi", w: 190 }, { h: "Usia", w: 70 }, { h: "JK", w: 60 }, { h: "Pelayanan", w: 220 }, { h: "CG", w: 170 },
    ...(canAccount ? [{ h: "Role", w: 180 }] : []), ...(canGroups ? [{ h: "Kelompok & jabatan", w: 240 }] : []),
  ], [canAccount, canGroups]);
  const tableW = `max(100%, ${cols.reduce((a, c) => a + c.w, 0)}px)`;
  const thCls = "px-4 py-3.5 text-left text-[11.5px] font-extrabold uppercase tracking-[0.07em] text-[var(--ink-2)]";

  const selected = useMemo(() => items?.find((p) => p.id === selId) ?? items?.[0] ?? null, [items, selId]);

  return (
    <div className="flex flex-col gap-5">
      {/* Cari dan filter */}
      <div ref={barRef} className="contents">
      <FilterBar active={dirty} onReset={resetFilters}
        moreCount={[commId, cgId, groupId, gender, origin, ageMin || ageMax, roleF].filter(Boolean).length}
        more={
          <>
            <FSelect label="Komunitas" value={commId} onChange={setCommId} allLabel="Semua komunitas" options={lookups?.communities.map((c) => ({ value: c.id, label: c.name }))} />
            <FSelect label="CG" value={cgId} onChange={setCgId} allLabel="Semua CG">
              <option value="NONE">Belum punya CG</option>
              {lookups?.cgs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </FSelect>
            {canGroups && (
              <FSelect label="Kelompok" value={groupId} onChange={setGroupId} allLabel="Semua kelompok">
                <option value="NONE">Tidak di kelompok mana pun</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </FSelect>
            )}
            <FSelect label="Jenis kelamin" value={gender} onChange={setGender} allLabel="Semua" options={[{ value: "L", label: "Laki-laki" }, { value: "P", label: "Perempuan" }]} />
            <FSelect label="Asal" value={origin} onChange={setOrigin} allLabel="Semua" options={[{ value: "DALAM", label: "Dalam gereja" }, { value: "LUAR", label: "Dari luar" }]} />
            <FNumber label="Usia dari" value={ageMin} onChange={setAgeMin} placeholder="17" />
            <FNumber label="Usia sampai" value={ageMax} onChange={setAgeMax} placeholder="30" />
            {canAccount && (
              <FSelect label="Role" value={roleF} onChange={setRoleF} allLabel="Semua role">
                <option value="NO_ACCOUNT">Belum punya akun</option>
                <option value="NO_ROLE">Akun tanpa role</option>
                {["SUPERADMIN", "PENGAWAS", "PENJADWAL", "ADMIN_TIM", "PETUGAS_ABSEN", "PELAYAN"].map((c) => <option key={c} value={c}>{ROLE_LABEL[c]}</option>)}
              </FSelect>
            )}
          </>
        }>
        <FSearch label="Cari nama" value={q} onChange={setQ} placeholder="Nama orang" />
        <FSelect label="Pelayanan" value={ministryId} onChange={setMinistryId} allLabel="Semua pelayanan">
          <option value="NONE">Belum punya pelayanan</option>
          {lookups?.teams.map((t) => <optgroup key={t.id} label={t.name}>{t.ministries.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup>)}
        </FSelect>
        <FSelect label="Posisi" value={positionId} onChange={setPositionId} allLabel="Semua posisi" options={lookups?.positions.map((p) => ({ value: p.id, label: p.name }))} />
      </FilterBar>
      </div>
      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap items-start gap-5">
        {/* Tabel */}
        <section className="min-w-0 flex-[3_1_560px] overflow-clip rounded-[20px] border border-[var(--line)] bg-white" aria-busy={list.loading}>
          {!items && !error && <p className="p-6 text-sm text-[var(--ink-2)]">Memuat…</p>}
          {items && items.length === 0 && <p className="p-10 text-center text-sm font-semibold text-[var(--ink-2)]">{dirty ? "Tidak ada orang yang cocok dengan filter ini." : "Belum ada orang."}</p>}
          {items && items.length > 0 && (
            <>
            {/* HP: daftar ringkas, satu baris per orang; ketuk untuk membuka pelayanan, CG, dan role */}
            <CompactList label="Daftar orang">
              {items.map((p) => (
                <CompactRow key={p.id} id={p.id} open={rows.open.has(p.id)} onToggle={rows.toggle}
                  lead={<span className={`grid size-9 place-items-center rounded-full text-xs font-bold ${p.origin === "LUAR" ? "bg-[var(--gold-soft)] text-[var(--gold-ink)]" : "bg-[var(--primary-soft)] text-[var(--primary-ink)]"}`} aria-hidden="true">{initials(p.name)}</span>}
                  title={fullName(p)}
                  sub={[p.position.name, p.age != null ? `${p.age} th` : null, p.gender].filter(Boolean).join(" · ")}>
                  <div className="flex flex-wrap gap-1.5">
                    {p.ministries.length === 0 && <span className="text-xs font-medium text-[var(--ink-2)]">Belum ada pelayanan</span>}
                    {p.ministries.map((m) => <span key={m.id} className="whitespace-nowrap rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--primary-ink)]">{m.name.replace(/ \(WL\)$/, "")}</span>)}
                  </div>
                  <Detail label="CG">
                    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      {p.cgGroup?.name ?? "–"}
                      {leaderOf.has(p.id) && <span className="whitespace-nowrap rounded-full bg-[#E3F4E8] px-2.5 py-0.5 text-xs font-bold text-[#1B6B34]">Leader CG</span>}
                    </span>
                  </Detail>
                  {canAccount && <Detail label="Role"><RoleChips account={p.account} /></Detail>}
                  {canGroups && p.memberships && p.memberships.length > 0 && <Detail label="Kelompok"><MembershipChips items={p.memberships} /></Detail>}
                  <button type="button" onClick={() => setSheetId(p.id)} className="h-9 self-start rounded-xl border border-[var(--line)] bg-white px-3.5 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[var(--bg)]">Detail &amp; ubah</button>
                </CompactRow>
              ))}
            </CompactList>
            <div className="relative max-md:hidden">
              {/* Header yang menempel: salinan visual, ikut bergeser saat tabel digeser ke samping; hilang bersama tabelnya */}
              <div className="sticky z-10 overflow-hidden border-b border-[var(--line-2)] bg-white" style={{ top: headTop }} aria-hidden="true">
                <div ref={headScroll} style={{ width: tableW }}>
                  <table className="w-full table-fixed border-collapse">
                    <colgroup>{cols.map((c) => <col key={c.h} style={{ width: c.w }} />)}</colgroup>
                    <thead><tr>{cols.map((c) => <th key={c.h} className={thCls}>{c.h}</th>)}</tr></thead>
                  </table>
                </div>
              </div>
            <div className="overflow-x-auto" onScroll={(e) => { if (headScroll.current) headScroll.current.style.transform = `translateX(${-e.currentTarget.scrollLeft}px)`; }}>
              <table className="table-fixed border-collapse text-left text-sm" style={{ width: tableW }}>
                <colgroup>{cols.map((c) => <col key={c.h} style={{ width: c.w }} />)}</colgroup>
                <thead className="sr-only">
                  <tr>{cols.map((c) => <th key={c.h} scope="col">{c.h}</th>)}</tr>
                </thead>
                <tbody>
                  {items.map((p) => {
                    const on = selected?.id === p.id;
                    return (
                      <tr key={p.id} tabIndex={0} aria-selected={on} onClick={() => setSelId(p.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelId(p.id); } }}
                        className={`cursor-pointer border-t border-[var(--line-2)] align-middle ${on ? "bg-[var(--primary-soft)]/60" : "hover:bg-[var(--bg)]"}`}>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-3">
                            <span className={`grid size-9 flex-none place-items-center rounded-full text-xs font-bold ${p.origin === "LUAR" ? "bg-[var(--gold-soft)] text-[var(--gold-ink)]" : "bg-[var(--primary-soft)] text-[var(--primary-ink)]"}`} aria-hidden="true">{initials(p.name)}</span>
                            <span className="font-bold">{fullName(p)}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isPlainPosition(p.position.name)
                            ? <span className="font-medium text-[var(--ink-2)]">{p.position.name}</span>
                            : <span className="whitespace-nowrap inline-block rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: posColor(p.position.name)[0], color: posColor(p.position.name)[1] }}>{p.position.name}</span>}
                        </td>
                        <td className="px-4 py-3 font-bold">{p.age ?? "–"}</td>
                        <td className="px-4 py-3 font-bold">{p.gender}</td>
                        <td className="px-4 py-3">
                          <span className="flex flex-wrap gap-1.5">
                            {p.ministries.length === 0 && <span className="text-[var(--ink-2)]">–</span>}
                            {p.ministries.map((m) => <span key={m.id} className="whitespace-nowrap rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--primary-ink)]">{m.name.replace(/ \(WL\)$/, "")}</span>)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-[var(--ink-2)]">{p.cgGroup?.name ?? "–"}</span>
                            {leaderOf.has(p.id) && <span title={`Leader ${leaderOf.get(p.id)!.join(", ")}`} className="whitespace-nowrap rounded-full bg-[#E3F4E8] px-2.5 py-0.5 text-xs font-bold text-[#1B6B34]">Leader CG</span>}
                          </span>
                        </td>
                        {canAccount && <td className="px-4 py-3"><RoleChips account={p.account} /></td>}
                        {canGroups && <td className="px-4 py-3"><MembershipChips items={p.memberships} /></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
            </>
          )}
          {items && <Pager page={list.page} pageSize={list.pageSize} total={total} onPage={list.setPage} onPageSize={list.setPageSize} noun="orang" />}
        </section>

        {/* Detail */}
        {selected && lookups && (
          <div className="contents max-md:hidden">
            <PersonDetail key={selected.id} canAccount={canAccount} person={selected} teams={lookups.teams} cgs={lookups.cgs} scope={scope} onEdit={() => setForm({ person: selected })} onChanged={() => void reload()} />
          </div>
        )}
      </div>

      {canMaster && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-[#EFE3C2] bg-[#FFFBF0] px-5 py-3.5">
          <span className="text-sm font-bold">Daftar ini bisa ditambah kapan saja:</span>
          {([["positions", "Posisi"], ["ministry", "Pelayanan"], ["communities", "Komunitas"], ["cg-groups", "Kelompok CG"]] as [NonNullable<typeof manage>, string][]).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setManage(k)} className="h-9 rounded-full border border-[#E3D3A4] bg-white px-4 text-[13px] font-bold hover:bg-[#FFF5DC]">{label}</button>
          ))}
        </div>
      )}

      {sheetId && lookups && items?.find((x) => x.id === sheetId) && (() => {
        const sp = items.find((x) => x.id === sheetId)!;
        return (
          <Modal title={fullName(sp)} onClose={() => setSheetId(null)} footer={<button type="button" className={btnPrimary} onClick={() => setSheetId(null)}>Tutup</button>}>
            <PersonDetail bare canAccount={canAccount} person={sp} teams={lookups.teams} cgs={lookups.cgs} scope={scope} onEdit={() => { setSheetId(null); setForm({ person: sp }); }} onChanged={() => void reload()} />
          </Modal>
        );
      })()}
      {manage === "ministry" && <MinistryManager onClose={() => { setManage(null); void loadLookups(); void reload(); }} onChange={() => void loadLookups()} />}
      {manage && manage !== "ministry" && (
        <Modal title={PICKLISTS[manage].title} onClose={() => { setManage(null); void loadLookups(); void reload(); }} footer={<button type="button" className={btnPrimary} onClick={() => { setManage(null); void loadLookups(); void reload(); }}>Selesai</button>}>
          <LookupManager kind={manage} singular={PICKLISTS[manage].singular} hint={PICKLISTS[manage].hint} />
        </Modal>
      )}
      {form && lookups && (
        <PersonForm person={form.person} lookups={lookups} scope={scope} canAccount={canAccount} isSuper={isSuper}
          onClose={() => setForm(null)} onRefresh={() => void reload()} onSaved={() => { setForm(null); void reload(); }} />
      )}
    </div>
  );
}

/** Kartu ringkasan di kanan: data orang yang dipilih, plus tambah/cabut pelayanan dengan cepat. */
function PersonDetail({ person: p, bare, canAccount, teams, cgs, scope, onEdit, onChanged }: { bare?: boolean; person: PersonDto; canAccount: boolean; teams: Team[]; cgs: CgOpt[]; scope: string[] | null; onEdit: () => void; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = (teamId: string) => scope === null || scope.includes(teamId);
  const canEditIdentity = scope === null || p.ministries.some((m) => scope.includes(m.teamTypeId)); // Admin Tim: hanya orang yang melayani di timnya
  const have = new Set(p.ministries.map((m) => m.id));
  const who = fullName;
  const myLeaders = cgs.find((c) => c.id === p.cgGroup?.id)?.leaders ?? [];
  const leads = cgs.filter((c) => c.leaders?.some((l) => l.id === p.id)).map((c) => c.name);

  /** Tambah atau cabut satu pelayanan. Yang dikirim hanya selisihnya, jadi tidak menimpa data lain yang baru diubah orang lain. */
  async function changeMinistry(kind: "add" | "remove", ministryId: string, label: string) {
    const name = fullName(p);
    const ok = kind === "remove"
      ? await askConfirm(`Cabut ${label} dari ${name}? Perubahan langsung tersimpan.`, { danger: true, confirmLabel: "Cabut" })
      : await askConfirm(`Tambah ${label} ke ${name}? Perubahan langsung tersimpan.`, { confirmLabel: "Tambah" });
    setAdding(false);
    if (!ok) return;
    setBusy(true); setError("");
    const r = await callApi("PATCH", `/api/v1/persons/${p.id}/ministries`, kind === "add" ? { add: [ministryId] } : { remove: [ministryId] });
    setBusy(false);
    if (r.ok) { showToast(kind === "add" ? `${label} ditambahkan ke ${name}` : `${label} dicabut dari ${name}`); onChanged(); }
    else { setError(errMsg(r.data)); showToast("Perubahan gagal disimpan", "error"); }
  }

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--line-2)] py-3 text-sm"><span className="text-[var(--ink-2)]">{label}</span><span className="text-right font-bold">{value}</span></div>
  );

  return (
    <aside className={bare ? "flex flex-col gap-4" : "flex min-w-[300px] max-md:min-w-0 max-w-[400px] flex-[1_1_320px] flex-col gap-4 rounded-[20px] border border-[var(--line)] bg-white p-[22px] lg:sticky lg:top-[calc(var(--header-h)+16px)] lg:max-h-[calc(100vh-var(--header-h)-32px)] lg:self-start lg:overflow-y-auto"}>
      <div className="flex items-center gap-4">
        <span className="grid size-[68px] flex-none place-items-center rounded-[18px] bg-[var(--primary-soft)] text-3xl font-extrabold text-[var(--primary-ink)]" aria-hidden="true">{initials(p.name).slice(0, 1)}</span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="truncate text-xl font-extrabold tracking-tight">{fullName(p)}</h2>
          <span className={`whitespace-nowrap self-start rounded-full px-2.5 py-[3px] text-xs font-bold ${p.origin === "LUAR" ? "bg-[var(--gold-soft)] text-[#6F4304]" : "bg-[#E3F4E8] text-[#1B6B34]"}`}>{p.origin === "LUAR" ? `Dari luar${p.originChurch ? ` · ${p.originChurch}` : ""}` : "Dalam gereja"}</span>
        </div>
      </div>
      <div className="flex flex-col">
        {row("Posisi", p.position.name)}
        {row("Tanggal lahir", birthText(p.birthDate))}
        {row("Jenis kelamin", p.gender === "L" ? "Laki-laki" : "Perempuan")}
        {row("Kelompok CG", p.cgGroup?.name ?? "—")}
        {p.cgGroup && row("Leader CG", myLeaders.length ? myLeaders.map(who).join(", ") : "—")}
        {leads.length > 0 && row("Leader di", leads.join(", "))}
        {p.memberships && (
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line-2)] py-3 text-sm">
            <span className="text-[var(--ink-2)]">Kelompok</span>
            <span className="flex flex-col items-end gap-1 text-right font-bold">
              {p.memberships.length === 0 && "—"}
              {p.memberships.map((m) => <span key={m.groupId}>{m.groupName}{m.positions.length > 0 && <span className="block text-xs font-semibold text-[var(--ink-2)]">{m.positions.join(", ")}</span>}</span>)}
            </span>
          </div>
        )}
        {row("Komunitas", p.communities.length ? p.communities.map((c) => c.name).join(", ") : "—")}
        {canAccount && p.account && (
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line-2)] py-3 text-sm">
            <span className="text-[var(--ink-2)]">Role</span>
            <span className="flex justify-end text-right"><RoleChips account={p.account} /></span>
          </div>
        )}
        {row("Akun login", p.account ? (p.account.isActive ? (p.account.mustChangePassword ? "Terhubung · belum ganti sandi" : "Terhubung") : "Nonaktif") : "Belum ada")}
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-extrabold uppercase tracking-[0.07em] text-[var(--gold-ink)]">Pelayanan</span>
          <span className="h-px flex-1 bg-[#E8E4D6]" />
        </div>
        <div className="flex flex-wrap gap-2">
          {p.ministries.map((m) => (
            <span key={m.id} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--primary-soft)] pl-4 pr-2 text-[13px] font-bold text-[var(--primary-ink)]" title={m.teamName}>
              {m.name.replace(/ \(WL\)$/, "")}
              {open(m.teamTypeId) && (
                <button type="button" disabled={busy} onClick={() => void changeMinistry("remove", m.id, m.name.replace(/ \(WL\)$/, ""))} aria-label={`Cabut ${m.name}`} className="grid size-5 place-items-center rounded-full text-xs hover:bg-white/70">✕</button>
              )}
              {!open(m.teamTypeId) && <span className="pr-2" />}
            </span>
          ))}
          {!adding ? (
            <button type="button" onClick={() => setAdding(true)} className="h-9 rounded-full border border-dashed border-[#B9BDDA] px-4 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-[#f3f4fb]">＋ pelayanan</button>
          ) : (
            <select autoFocus aria-label="Tambah pelayanan" defaultValue="" disabled={busy} onBlur={() => setAdding(false)}
              onChange={(e) => { const id = e.target.value; if (id) void changeMinistry("add", id, teams.flatMap((t) => t.ministries).find((m) => m.id === id)?.name ?? "pelayanan"); }} className="h-9 rounded-full border border-[var(--primary)] bg-white px-3 text-[13px] font-bold">
              <option value="">Pilih…</option>
              {teams.filter((t) => open(t.id)).map((t) => {
                const rest = t.ministries.filter((m) => !have.has(m.id));
                return rest.length ? <optgroup key={t.id} label={t.name}>{rest.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</optgroup> : null;
              })}
            </select>
          )}
        </div>
        {error && <p className="text-sm font-semibold text-[#9B1C1C]" role="alert">{error}</p>}
        <p className="text-xs font-medium leading-relaxed text-[var(--ink-2)]">Nama pembicara luar disimpan di sini agar penulisannya tidak berubah atau dobel saat diundang lagi.</p>
      </div>
      {canEditIdentity
        ? <button type="button" className={btnGhost} onClick={onEdit}>Ubah data lengkap</button>
        : <p className="text-xs font-medium leading-relaxed text-[var(--ink-2)]">Data lengkap orang ini hanya bisa diubah oleh Penjadwal atau Admin Tim dari tim tempat ia melayani.</p>}
    </aside>
  );
}
