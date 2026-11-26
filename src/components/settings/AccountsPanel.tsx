"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PAGE_SIZE } from "@/lib/paging";
import { askConfirm } from "@/components/ui/Confirm";
import { CompactList, CompactRow, Detail, useOpenRows } from "@/components/ui/CompactList";
import Modal, { Field } from "@/components/master/Modal";
import PasswordField, { genPassword, IssuedPassword } from "@/components/master/PasswordField";
import { btnGhost, btnPrimary, callApi, card, errMsg, inputCls } from "@/components/jadwal/api";
import { ROLE_LABEL } from "@/lib/ui";
import Pager from "@/components/ui/Pager";
import MembershipChips, { type Membership } from "@/components/ui/MembershipChips";
import { FilterBar, FSearch, FSelect } from "@/components/ui/Filters";

type Acc = { id: string; personId: string | null; name: string | null; email: string; isActive: boolean; mustChangePassword: boolean; twoFactor?: boolean; isOwner?: boolean; roleCodes: string[]; teamTypeId: string | null; teamName: string | null; memberships?: Membership[] };
type Team = { id: string; name: string };
const rolesText = (a: Acc) => (a.roleCodes.length ? a.roleCodes.map((c) => ROLE_LABEL[c] ?? c).join(", ") + (a.teamName ? ` · ${a.teamName}` : "") : "Anggota (tanpa role)");

export default function AccountsPanel({ selfId, isSuper }: { selfId: string; isSuper: boolean }) {
  const rows = useOpenRows(); // HP: baris akun yang dibuka
  const [items, setItems] = useState<Acc[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [groupId, setGroupId] = useState("");
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [dlg, setDlg] = useState<{ kind: "role" | "reset" | "email"; acc: Acc } | null>(null);

  useEffect(() => { const t = setTimeout(() => { setSearch(q.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { void callApi("GET", "/api/v1/groups").then((r) => { if (r.ok) setGroups(r.data.items as { id: string; name: string }[]); }); }, []);
  useEffect(() => { void callApi("GET", "/api/v1/teams").then((r) => { if (r.ok) setTeams(r.data.items as Team[]); }); }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search) p.set("search", search); if (role) p.set("role", role); if (status) p.set("status", status);
    if (groupId) p.set("groupId", groupId);
    const r = await callApi("GET", `/api/v1/accounts?${p}`);
    setLoading(false);
    if (!r.ok) return setError(errMsg(r.data));
    setItems(r.data.items as Acc[]); setTotal(r.data.total as number);
  }, [page, pageSize, search, role, status, groupId]);
  useEffect(() => { void load(); }, [load]);

  async function patch(a: Acc, body: unknown) {
    const r = await callApi("PATCH", `/api/v1/accounts/${a.id}`, body);
    if (r.ok) await load();
    return r;
  }
  async function resetTwoFactor(a: Acc) {
    const ok = await askConfirm(`Reset verifikasi 2 langkah ${a.name ?? a.email}? Semua sesinya dikeluarkan. Ia masuk dengan kata sandi saja, lalu perlu mengaktifkan 2 langkah lagi. Lakukan hanya bila ia sendiri yang meminta (HP hilang dan kode cadangan habis).`, { confirmLabel: "Reset 2 langkah", danger: true });
    if (!ok) return;
    setMsg(""); setError("");
    const r = await callApi("DELETE", `/api/v1/accounts/${a.id}/2fa`);
    if (!r.ok) return setError(errMsg(r.data));
    setMsg(`Verifikasi 2 langkah ${a.name ?? a.email} direset.`);
    await load();
  }
  async function toggle(a: Acc, on: boolean) {
    const ok = on
      ? await askConfirm(`Aktifkan kembali akun ${a.email}? ${a.name ?? "Pemiliknya"} bisa masuk lagi.`, { confirmLabel: "Aktifkan" })
      : await askConfirm(`Nonaktifkan akun ${a.email}? ${a.name ?? "Pemiliknya"} tidak bisa masuk lagi sampai diaktifkan kembali.`);
    if (!ok) return;
    setMsg(""); setError("");
    const r = await patch(a, { isActive: on });
    if (!r.ok) setError(errMsg(r.data)); else setMsg(on ? `Akun ${a.email} diaktifkan kembali.` : `Akun ${a.email} dinonaktifkan.`);
  }

  const link = "rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-medium text-[var(--ink-2)]">Akun baru dibuat dari halaman Orang (atau lewat Impor data). Di sini Anda mengatur akun yang sudah ada.</p>
      <FilterBar active={!!(q || role || status || groupId)} onReset={() => { setQ(""); setRole(""); setStatus(""); setGroupId(""); setPage(1); }} moreCount={(status ? 1 : 0) + (groupId ? 1 : 0)}
        more={
          <>
            <FSelect label="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} allLabel="Semua status" options={[{ value: "active", label: "Aktif" }, { value: "inactive", label: "Nonaktif" }]} />
            <FSelect label="Kelompok" value={groupId} onChange={(v) => { setGroupId(v); setPage(1); }} allLabel="Semua kelompok">
              <option value="NONE">Tidak di kelompok mana pun</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </FSelect>
          </>
        }>
        <FSearch label="Cari nama atau email" value={q} onChange={setQ} placeholder="mis. Ruth atau ruth@…" />
        <FSelect label="Role" value={role} onChange={(v) => { setRole(v); setPage(1); }} allLabel="Semua role">
          <option value="NONE">Tanpa role</option>
          {Object.entries(ROLE_LABEL).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
        </FSelect>
      </FilterBar>

      {msg && <p role="status" className="rounded-xl bg-[#E3F4E8] px-3.5 py-2.5 text-sm font-semibold text-[#1B6B34]">{msg}</p>}
      {error && <p role="alert" className="rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-sm font-semibold text-[#a12b2b]">{error}</p>}

      <section className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white">
        {/* HP: daftar ringkas, satu baris per akun */}
        {loading && items.length === 0 && <p className="px-4 py-8 text-center text-sm font-semibold text-[var(--ink-2)] md:hidden">Memuat…</p>}
        {!loading && items.length === 0 && <p className="px-4 py-8 text-center text-sm font-semibold text-[var(--ink-2)] md:hidden">Tidak ada akun yang cocok.</p>}
        {items.length > 0 && (
          <CompactList label="Daftar akun">
            {items.map((a) => {
              const self = a.id === selfId;
              const locked = (a.roleCodes.includes("SUPERADMIN") && !isSuper) || (!!a.isOwner && !self);
              return (
                <CompactRow key={a.id} id={a.id} open={rows.open.has(a.id)} onToggle={rows.toggle} tone={a.isActive ? "" : "bg-[var(--surface-2)]"}
                  title={<>{a.name ?? a.email}{self && <span className="ml-2 whitespace-nowrap rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary-ink)]">Anda</span>}{a.isOwner && <span className="ml-2 whitespace-nowrap rounded-full bg-[var(--gold-soft)] px-2 py-0.5 text-[11px] font-bold text-[#6F4304]">Utama</span>}</>}
                  sub={rolesText(a)}
                  trailing={<span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${a.isActive ? "bg-[#E3F4E8] text-[#1B6B34]" : "bg-[#ECEEF4] text-[#565b76]"}`}>{a.isActive ? "Aktif" : "Nonaktif"}</span>}>
                  {a.name && <Detail label="Email"><span className="break-all">{a.email}</span></Detail>}
                  {!a.personId && <p className="text-xs font-medium text-[var(--ink-2)]">Tidak terhubung ke data orang</p>}
                  {a.mustChangePassword && <Detail label="Sandi"><span className="whitespace-nowrap rounded-full bg-[var(--gold-soft)] px-2.5 py-0.5 text-xs font-bold text-[#6F4304]">Belum ganti sandi</span></Detail>}
                  {a.twoFactor && <Detail label="2 langkah"><span className="whitespace-nowrap rounded-full bg-[#E3F4E8] px-2.5 py-0.5 text-xs font-bold text-[#1B6B34]">Aktif</span></Detail>}
                  {a.memberships && a.memberships.length > 0 && <Detail label="Kelompok"><MembershipChips items={a.memberships} /></Detail>}
                  {locked ? <p className="text-xs font-medium text-[var(--ink-2)]">{a.isOwner ? "Akun Superadmin utama: hanya pemiliknya yang bisa mengubah." : "Hanya Superadmin yang bisa mengubah akun ini."}</p> : (
                    <div className="flex flex-wrap gap-0.5">
                      <button type="button" className={link} onClick={() => { setMsg(""); setDlg({ kind: "role", acc: a }); }}>Ubah role</button>
                      <button type="button" className={link} onClick={() => { setMsg(""); setDlg({ kind: "email", acc: a }); }}>Ubah email</button>
                      <button type="button" className={link} onClick={() => { setMsg(""); setDlg({ kind: "reset", acc: a }); }}>Reset sandi</button>
                      {a.twoFactor && isSuper && !self && <button type="button" className={link} onClick={() => void resetTwoFactor(a)}>Reset 2 langkah</button>}
                      {a.isActive
                        ? <button type="button" disabled={self} onClick={() => void toggle(a, false)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#9B1C1C] hover:bg-[#FFF5F5] disabled:cursor-not-allowed disabled:opacity-40">Nonaktifkan</button>
                        : <button type="button" className={link} onClick={() => void toggle(a, true)}>Aktifkan</button>}
                    </div>
                  )}
                </CompactRow>
              );
            })}
          </CompactList>
        )}
        <div className="overflow-x-auto max-md:hidden">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-xs font-bold uppercase tracking-wide text-[var(--ink-2)]">
              <tr><th className="px-4 py-3">Akun</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Kelompok &amp; jabatan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Aksi</th></tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const self = a.id === selfId;
                const locked = (a.roleCodes.includes("SUPERADMIN") && !isSuper) || (!!a.isOwner && !self);
                return (
                  <tr key={a.id} className={`border-t border-[var(--line-2)] ${a.isActive ? "" : "bg-[var(--surface-2)] text-[var(--ink-2)]"}`}>
                    <td className="px-4 py-3">
                      <div className="font-bold">{a.name ?? a.email}{self && <span className="whitespace-nowrap ml-2 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary-ink)]">Anda</span>}{a.isOwner && <span className="whitespace-nowrap ml-2 rounded-full bg-[var(--gold-soft)] px-2 py-0.5 text-[11px] font-bold text-[#6F4304]">Utama</span>}</div>
                      {a.name && <div className="text-xs font-medium text-[var(--ink-2)]">{a.email}</div>}
                      {!a.personId && <div className="text-xs font-medium text-[var(--ink-2)]">Tidak terhubung ke data orang</div>}
                    </td>
                    <td className="px-4 py-3 font-semibold">{rolesText(a)}</td>
                    <td className="px-4 py-3"><MembershipChips items={a.memberships} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${a.isActive ? "bg-[#E3F4E8] text-[#1B6B34]" : "bg-[#ECEEF4] text-[#565b76]"}`}>{a.isActive ? "Aktif" : "Nonaktif"}</span>
                        {a.mustChangePassword && <span className="whitespace-nowrap rounded-full bg-[var(--gold-soft)] px-2.5 py-0.5 text-xs font-bold text-[#6F4304]">Belum ganti sandi</span>}
                        {a.twoFactor && <span className="whitespace-nowrap rounded-full bg-[#E3F4E8] px-2.5 py-0.5 text-xs font-bold text-[#1B6B34]">2 langkah</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-0.5">
                        {locked ? <span className="text-xs font-medium text-[var(--ink-2)]">{a.isOwner ? "Hanya pemiliknya" : "Hanya Superadmin"}</span> : (
                          <>
                            <button type="button" className={link} onClick={() => { setMsg(""); setDlg({ kind: "role", acc: a }); }}>Ubah role</button>
                            <button type="button" className={link} onClick={() => { setMsg(""); setDlg({ kind: "email", acc: a }); }}>Ubah email</button>
                            <button type="button" className={link} onClick={() => { setMsg(""); setDlg({ kind: "reset", acc: a }); }}>Reset sandi</button>
                            {a.twoFactor && isSuper && !self && <button type="button" className={link} onClick={() => void resetTwoFactor(a)}>Reset 2 langkah</button>}
                            {a.isActive
                              ? <button type="button" disabled={self} title={self ? "Anda tidak bisa menonaktifkan akun sendiri" : undefined} onClick={() => void toggle(a, false)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-[#9B1C1C] hover:bg-[#FFF5F5] disabled:cursor-not-allowed disabled:opacity-40">Nonaktifkan</button>
                              : <button type="button" className={link} onClick={() => void toggle(a, true)}>Aktifkan</button>}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && items.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-[var(--ink-2)]">Tidak ada akun yang cocok.</td></tr>}
              {loading && items.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-[var(--ink-2)]">Memuat…</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="akun" />
      </section>

      {dlg?.kind === "role" && <RoleDialog acc={dlg.acc} teams={teams} isSuper={isSuper} self={dlg.acc.id === selfId} onClose={() => setDlg(null)} patch={(b) => patch(dlg.acc, b)} onDone={() => { setMsg(`Role ${dlg.acc.email} diperbarui. Berlaku saat orang itu masuk lagi.`); setDlg(null); }} />}
      {dlg?.kind === "email" && <EmailDialog acc={dlg.acc} self={dlg.acc.id === selfId} onClose={() => setDlg(null)} patch={(b) => patch(dlg.acc, b)} onDone={(to) => { setMsg(`Email akun diubah dari ${dlg.acc.email} menjadi ${to}. Pakai email baru untuk masuk.`); setDlg(null); }} />}
      {dlg?.kind === "reset" && <ResetDialog acc={dlg.acc} onClose={() => setDlg(null)} patch={(b) => patch(dlg.acc, b)} />}
    </div>
  );
}

type PatchFn = (b: unknown) => Promise<{ ok: boolean; data: { error?: { message?: string; code?: string } } | null }>;

function RoleDialog({ acc, teams, isSuper, self, onClose, patch, onDone }: { acc: Acc; teams: Team[]; isSuper: boolean; self: boolean; onClose: () => void; patch: PatchFn; onDone: () => void }) {
  const options = ["PENJADWAL", "ADMIN_TIM", "ADMIN_JEMAAT", "PETUGAS_ABSEN", "PELAYAN", ...(isSuper ? ["PENGAWAS", "SUPERADMIN"] : [])];
  const [sel, setSel] = useState<string[]>(acc.roleCodes);
  const [teamId, setTeamId] = useState(acc.teamTypeId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = (c: string) => setSel((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const needTeam = sel.includes("ADMIN_TIM");
  const isEbmTeam = needTeam && /\bebm\b/i.test(teams.find((t) => t.id === teamId)?.name ?? "");
  async function save() {
    setBusy(true); setError("");
    const r = await patch({ roleCodes: sel, teamTypeId: needTeam ? teamId || null : null });
    setBusy(false);
    if (!r.ok) setError(errMsg(r.data)); else onDone();
  }
  return (
    <Modal title="Ubah role" onClose={onClose} footer={<><button type="button" className={btnGhost} onClick={onClose}>Batal</button><button type="button" className={btnPrimary} disabled={busy || (needTeam && !teamId)} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan role"}</button></>}>
      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold">{acc.name ?? acc.email}<span className="block text-xs font-medium text-[var(--ink-2)]">{acc.email}</span></p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Role">
          {options.map((c) => {
            const on = sel.includes(c);
            return <button key={c} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(c)} className={`h-9 rounded-full border px-3.5 text-[13px] font-bold ${on ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[#D0D3E8] bg-white text-[var(--ink-2)] hover:bg-[#f3f4f9]"}`}>{on ? "✓ " : ""}{ROLE_LABEL[c]}</button>;
          })}
        </div>
        <p className="text-xs font-medium text-[var(--ink-2)]">{sel.length ? "Role yang dipilih berlaku bersamaan." : "Tanpa role: orang ini hanya bisa melihat kalender dan jadwalnya sendiri."}</p>
        {needTeam && (
          <Field label="Tim yang dikelola">
            <select className={inputCls} value={teamId} onChange={(e) => setTeamId(e.target.value)}><option value="">Pilih tim…</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          </Field>
        )}
        {isEbmTeam && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 text-xs font-medium leading-relaxed text-[var(--ink-2)]">Admin Tim EBM otomatis menjadi anggota kelompok EBM dengan jabatan Admin Tim (akses penuh): menjadwalkan rapat, menulis dan memfinalkan notulen, serta mengelola anggota kelompok.</p>
      )}
        {self && <p className="text-xs font-medium text-[var(--ink-2)]">Ini akun Anda sendiri: role Superadmin tidak bisa dicabut dari sini.</p>}
        {error && <p role="alert" className="rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-sm font-semibold text-[#a12b2b]">{error}</p>}
      </div>
    </Modal>
  );
}

function EmailDialog({ acc, self, onClose, patch, onDone }: { acc: Acc; self: boolean; onClose: () => void; patch: PatchFn; onDone: (to: string) => void }) {
  const [email, setEmail] = useState(acc.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const next = email.trim().toLowerCase();
  const same = next === acc.email.toLowerCase();
  async function save() {
    setBusy(true); setError("");
    const r = await patch({ email: next });
    setBusy(false);
    if (!r.ok) setError(r.data?.error?.code === "VALIDATION" ? "Alamat email tidak valid." : errMsg(r.data)); else onDone(next);
  }
  return (
    <Modal title="Ubah email" onClose={onClose} footer={<><button type="button" className={btnGhost} onClick={onClose}>Batal</button><button type="button" className={btnPrimary} disabled={busy || same || !next} onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan email"}</button></>}>
      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold">{acc.name ?? acc.email}<span className="block text-xs font-medium text-[var(--ink-2)]">Email sekarang: {acc.email}</span></p>
        <Field label="Email baru" hint="Dipakai untuk masuk. Kata sandi dan role tidak berubah. Email baru ditandai belum terverifikasi.">
          <input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        </Field>
        {self && <p className="text-xs font-medium text-[var(--ink-2)]">Ini akun Anda sendiri: setelah disimpan, masuklah dengan email baru ini.</p>}
        {error && <p role="alert" className="rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-sm font-semibold text-[#a12b2b]">{error}</p>}
      </div>
    </Modal>
  );
}

function ResetDialog({ acc, onClose, patch }: { acc: Acc; onClose: () => void; patch: PatchFn }) {
  const [pw, setPw] = useState(() => genPassword());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function save() {
    setBusy(true); setError("");
    const r = await patch({ newPassword: pw });
    setBusy(false);
    if (!r.ok) setError(r.data?.error?.code === "VALIDATION" ? "Kata sandi minimal 8 karakter." : errMsg(r.data)); else setDone(true);
  }
  return (
    <Modal title="Reset kata sandi" onClose={onClose}
      footer={done ? <button type="button" className={btnPrimary} onClick={onClose}>Selesai</button> : <><button type="button" className={btnGhost} onClick={onClose}>Batal</button><button type="button" className={btnPrimary} disabled={busy || pw.length < 8} onClick={() => void save()}>{busy ? "Menyimpan…" : "Reset kata sandi"}</button></>}>
      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold">{acc.name ?? acc.email}<span className="block text-xs font-medium text-[var(--ink-2)]">{acc.email}</span></p>
        {!done ? (
          <>
            <PasswordField label="Kata sandi sementara" hint="Minimal 8 karakter. Berikan ke orangnya; ia wajib menggantinya saat masuk." value={pw} onChange={setPw} />
          </>
        ) : (
          <IssuedPassword email={acc.email} password={pw} />
        )}
        {error && <p role="alert" className="rounded-xl bg-[#fdecec] px-3.5 py-2.5 text-sm font-semibold text-[#a12b2b]">{error}</p>}
      </div>
    </Modal>
  );
}
