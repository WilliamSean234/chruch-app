"use client";

import { useState } from "react";
import { askConfirm } from "@/components/ui/Confirm";
import Modal, { confirmDiscard, Field } from "./Modal";
import PasswordField, { genPassword, IssuedPassword } from "./PasswordField";
import { btnGhost, btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";
import { ROLE_LABEL } from "@/lib/ui";

export type Opt = { id: string; name: string };
export type Team = { id: string; name: string; ministries: Opt[] };
export type PersonDto = {
  id: string; name: string; title: string | null; nickname?: string | null; aliases?: string[]; birthDate: string | null; age: number | null; gender: "L" | "P"; origin: "DALAM" | "LUAR"; originChurch: string | null;
  position: Opt; cgGroup: Opt | null; communities: Opt[]; ministries: { id: string; name: string; teamTypeId: string; teamName: string }[];
  account: { email: string; isActive: boolean; mustChangePassword?: boolean; roleCodes?: string[]; teamTypeId?: string | null } | null;
  /** Kelompok rapat + jabatan; hanya dikirim server untuk Superadmin. */
  memberships?: { groupId: string; groupName: string; positions: string[] }[];
};
export type CgOpt = Opt & { leaders?: { id: string; name: string; title?: string | null }[] };
export type Lookups = { positions: Opt[]; cgs: CgOpt[]; communities: Opt[]; teams: Team[] };
type Dup = { id: string; name: string; birthDate: string | null; position: string };

/** Tambah / ubah satu orang beserta pelayanannya. Akun login diatur di bagian bawah (khusus yang berhak). */
export default function PersonForm({ person, lookups, scope, canAccount, isSuper, onSaved, onRefresh, onClose }: {
  person: PersonDto | null; lookups: Lookups; scope: string[] | null; canAccount: boolean; isSuper: boolean; onSaved: () => void; onRefresh: () => void; onClose: () => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [title, setTitle] = useState(person?.title ?? "");
  const [nickname, setNickname] = useState(person?.nickname ?? "");
  const [aliasText, setAliasText] = useState((person?.aliases ?? []).join(", "));
  const [gender, setGender] = useState<"L" | "P" | "">(person?.gender ?? "");
  const [birth, setBirth] = useState(person?.birthDate ?? "");
  const [positionId, setPositionId] = useState(person?.position.id ?? lookups.positions.find((p) => p.name === "Jemaat")?.id ?? lookups.positions[0]?.id ?? "");
  const [cgId, setCgId] = useState(person?.cgGroup?.id ?? "");
  const [origin, setOrigin] = useState<"DALAM" | "LUAR">(person?.origin ?? "DALAM");
  const [church, setChurch] = useState(person?.originChurch ?? "");
  const [comm, setComm] = useState<Set<string>>(new Set(person?.communities.map((c) => c.id)));
  const [mins, setMins] = useState<Set<string>>(new Set(person?.ministries.map((m) => m.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dups, setDups] = useState<Dup[]>([]);

  const sig = JSON.stringify([name, title, nickname, aliasText, gender, birth, positionId, cgId, origin, church, [...comm].sort(), [...mins].sort()]);
  const [initialSig] = useState(sig);
  const dirty = sig !== initialSig; // ada isian yang belum disimpan
  const cancel = async () => { if (await confirmDiscard(dirty)) onClose(); };

  const flip = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); fn(n); };
  const teamOpen = (teamId: string) => scope === null || scope.includes(teamId);

  async function save(confirmDuplicate = false) {
    if (!name.trim()) return setError("Nama wajib diisi.");
    if (!gender) return setError("Pilih jenis kelamin.");
    if (!positionId) return setError("Pilih posisi di gereja.");
    if (origin === "LUAR" && !church.trim()) return setError("Isi gereja asal untuk orang dari luar.");
    setBusy(true); setError(""); setDups([]);
    const body = {
      name: name.trim(), title: title.trim() || null, nickname: nickname.trim() || null, aliases: person ? aliasText.split(",").map((x) => x.trim()).filter(Boolean) : undefined, gender, birthDate: birth || null, positionId, cgGroupId: cgId || null,
      origin, originChurch: origin === "LUAR" ? church.trim() : null, communityIds: [...comm], ministryIds: [...mins],
      confirmDuplicate: confirmDuplicate || undefined,
    };
    const r = person ? await callApi("PUT", `/api/v1/persons/${person.id}`, body) : await callApi("POST", "/api/v1/persons", body);
    setBusy(false);
    if (r.ok) { onSaved(); return; }
    if (r.data?.error?.code === "DUPLICATE_PERSON") setDups(r.data.error.details?.matches ?? []);
    setError(errMsg(r.data));
  }

  async function remove() {
    if (!person || !(await askConfirm(`Hapus ${person.name}? Akun loginnya (bila ada) ikut dinonaktifkan.`))) return;
    setBusy(true); setError("");
    const r = await callApi("DELETE", `/api/v1/persons/${person.id}`);
    setBusy(false);
    if (r.ok) onSaved(); else setError(errMsg(r.data));
  }

  return (
    <Modal wide title={person ? `Ubah ${person.name}` : "Tambah orang"} onClose={onClose} dirty={dirty} footer={
      <>
        {person && isSuper && <button type="button" onClick={remove} disabled={busy} className="mr-auto rounded-xl px-3 py-2 text-sm font-bold text-[#9B1C1C] hover:bg-[#FFF5F5]">Hapus orang</button>}
        <button type="button" className={btnGhost} onClick={() => void cancel()}>Batal</button>
        <button type="button" className={btnPrimary} disabled={busy} onClick={() => save()}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </>
    }>
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="Nama"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus={!person} maxLength={120} /></Field>
          <Field label="Gelar" hint="mis. Pdt., Ps."><input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={20} /></Field>
        </div>
        <div className={`grid grid-cols-1 gap-4 ${person ? "sm:grid-cols-2" : ""}`}>
          <Field label="Nama panggilan" hint="Tampil di jadwal yang dibagikan, mis. Ko Yosi"><input className={inputCls} value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40} /></Field>
          {person && <Field label="Ejaan lain di file jadwal" hint="Pisahkan dengan koma. Terisi otomatis saat Anda mencocokkan nama di upload jadwal."><input className={inputCls} value={aliasText} onChange={(e) => setAliasText(e.target.value)} /></Field>}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Jenis kelamin">
            <select className={inputCls} value={gender} onChange={(e) => setGender(e.target.value as "L" | "P" | "")}>
              <option value="">Pilih…</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
            </select>
          </Field>
          <Field label="Tanggal lahir"><input type="date" className={inputCls} value={birth} onChange={(e) => setBirth(e.target.value)} /></Field>
          <Field label="Posisi di gereja">
            <select className={inputCls} value={positionId} onChange={(e) => setPositionId(e.target.value)}>
              {lookups.positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Kelompok CG">
            <select className={inputCls} value={cgId} onChange={(e) => setCgId(e.target.value)}>
              <option value="">— Tidak ada —</option>
              {lookups.cgs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Asal">
            <select className={inputCls} value={origin} onChange={(e) => setOrigin(e.target.value as "DALAM" | "LUAR")}>
              <option value="DALAM">Jemaat dalam</option><option value="LUAR">Dari luar</option>
            </select>
          </Field>
          {origin === "LUAR" && <Field label="Gereja asal"><input className={inputCls} value={church} onChange={(e) => setChurch(e.target.value)} maxLength={120} /></Field>}
        </div>

        {lookups.communities.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-bold">Komunitas</legend>
            <div className="flex flex-wrap gap-2">
              {lookups.communities.map((c) => <Chip key={c.id} on={comm.has(c.id)} onClick={() => flip(comm, c.id, setComm)}>{c.name}</Chip>)}
            </div>
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
          <legend className="px-1 text-[13px] font-bold">Bisa melayani sebagai</legend>
          {lookups.teams.map((t) => (
            <div key={t.id} className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-extrabold tracking-[0.07em] text-[var(--gold-ink)]">{t.name.toUpperCase()}{teamOpen(t.id) ? "" : " · bukan tim Anda"}</span>
              <div className="flex flex-wrap gap-2">
                {t.ministries.length === 0 && <span className="text-xs text-[var(--ink-2)]">Belum ada posisi.</span>}
                {t.ministries.map((m) => <Chip key={m.id} on={mins.has(m.id)} disabled={!teamOpen(t.id)} onClick={() => flip(mins, m.id, setMins)}>{m.name}</Chip>)}
              </div>
            </div>
          ))}
        </fieldset>

        {error && <p className="rounded-xl border border-[#F2C9C9] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#9B1C1C]" role="alert">{error}</p>}
        {dups.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {dups.map((m) => (
              <div key={m.id} className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm"><b>{m.name}</b> <span className="text-xs text-[var(--ink-2)]">· {m.position}{m.birthDate ? ` · lahir ${m.birthDate}` : ""}</span></div>
            ))}
            <button type="button" disabled={busy} onClick={() => save(true)} className="h-10 rounded-xl border border-[#EAD9AE] bg-[#FFFBF0] text-sm font-bold text-[#6F4304] hover:bg-[#FFF5DC]">Bukan mereka, tetap simpan</button>
          </div>
        )}

        {person && canAccount && <AccountSection person={person} teams={lookups.teams} isSuper={isSuper} onChanged={onRefresh} />}
      </div>
    </Modal>
  );
}

const Chip = ({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" role="checkbox" aria-checked={on} disabled={disabled} onClick={onClick}
    className={`h-9 rounded-full border px-3.5 text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[#D0D3E8] bg-white text-[var(--ink-2)] hover:bg-[#f3f4f9]"}`}>
    {on ? "✓ " : ""}{children}
  </button>
);

/** Akun login: dibuat, diubah rolenya, direset kata sandinya, atau dinonaktifkan terpisah dari data orang. */
function AccountSection({ person, teams, isSuper, onChanged }: { person: PersonDto; teams: Team[]; isSuper: boolean; onChanged: () => void }) {
  const [acc, setAcc] = useState(person.account);
  const [mode, setMode] = useState<"view" | "create" | "role" | "reset">("view");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("NONE");
  const [teamId, setTeamId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null); // kata sandi yang baru dibuat/direset, untuk dicatat
  const roles = ["NONE", "PENJADWAL", "ADMIN_TIM", "ADMIN_JEMAAT", "PETUGAS_ABSEN", "PELAYAN", ...(isSuper ? ["PENGAWAS", "SUPERADMIN"] : [])];
  const roleLabel = (c: string) => (c === "NONE" ? "Tanpa role (hanya melihat jadwal)" : ROLE_LABEL[c] ?? c);
  const accRoles = acc?.roleCodes ?? [];
  const roleText = accRoles.length ? accRoles.map((c) => ROLE_LABEL[c] ?? c).join(", ") : "Tanpa role (hanya melihat jadwal)";
  const lockedSuper = accRoles.includes("SUPERADMIN") && !isSuper; // hanya Superadmin yang boleh mengubah akun Superadmin
  const teamName = (id: string | null | undefined) => teams.find((t) => t.id === id)?.name;
  const isEbmTeam = role === "ADMIN_TIM" && /\bebm\b/i.test(teamName(teamId) ?? "");
  const roleBody = () => ({ roleCodes: role === "NONE" ? [] : [role], teamTypeId: role === "ADMIN_TIM" ? teamId || null : null });

  function open(m: "create" | "role" | "reset") {
    setError(""); setNote(""); setIssued(null); setPassword(m === "create" || m === "reset" ? genPassword() : "");
    if (m === "role") { setRole(accRoles.find((c) => c !== "NONE") ?? "NONE"); setTeamId(acc?.teamTypeId ?? ""); }
    setMode(m);
  }
  async function send(method: string, body: unknown, after: () => void) {
    setBusy(true); setError(""); setNote("");
    const r = await callApi(method, `/api/v1/persons/${person.id}/account`, body);
    setBusy(false);
    if (!r.ok) return setError(r.data?.error?.code === "VALIDATION" ? "Periksa isian (kata sandi minimal 8 karakter)." : errMsg(r.data));
    after(); onChanged();
  }
  const create = () =>
    send("POST", { email, password, ...roleBody() }, () => {
      setAcc({ email, isActive: true, mustChangePassword: true, roleCodes: role === "NONE" ? [] : [role], teamTypeId: role === "ADMIN_TIM" ? teamId : null });
      setMode("view"); setIssued({ email, password }); setPassword(""); setNote("Akun dibuat. Berikan email dan kata sandi awal ke orangnya; ia akan diminta membuat kata sandi baru saat pertama masuk.");
    });
  const saveRole = () =>
    send("PATCH", roleBody(), () => {
      if (acc) setAcc({ ...acc, roleCodes: role === "NONE" ? [] : [role], teamTypeId: role === "ADMIN_TIM" ? teamId : null });
      setMode("view"); setNote("Role diperbarui. Berlaku saat orang itu masuk lagi.");
    });
  const reset = () =>
    send("PATCH", { newPassword: password }, () => {
      if (acc) setAcc({ ...acc, mustChangePassword: true });
      setMode("view"); setIssued({ email: acc?.email ?? "", password }); setPassword(""); setNote("Kata sandi direset. Berikan kata sandi sementara ini ke orangnya; ia akan diminta menggantinya saat masuk.");
    });
  const toggle = async (on: boolean) => {
    const ok = on
      ? await askConfirm(`Aktifkan kembali akun ${acc?.email}? ${person.name} bisa masuk lagi.`, { confirmLabel: "Aktifkan" })
      : await askConfirm(`Nonaktifkan akun ${acc?.email}? ${person.name} tidak bisa masuk lagi.`);
    if (!ok) return;
    void send("PATCH", { isActive: on }, () => { if (acc) setAcc({ ...acc, isActive: on }); setNote(on ? "Akun diaktifkan kembali." : ""); });
  };

  const passwordField = (hint: string) => <PasswordField label="Kata sandi awal" hint={hint} value={password} onChange={setPassword} />;
  const roleFields = (
    <>
      <Field label="Role">
        <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((c) => <option key={c} value={c}>{roleLabel(c)}</option>)}</select>
      </Field>
      {role === "ADMIN_TIM" && (
        <Field label="Tim yang dikelola">
          <select className={inputCls} value={teamId} onChange={(e) => setTeamId(e.target.value)}><option value="">Pilih tim…</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </Field>
      )}
      {isEbmTeam && (
        <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3.5 py-3 text-xs font-medium leading-relaxed text-[var(--ink-2)]">Admin Tim EBM otomatis menjadi anggota kelompok EBM dengan jabatan Admin Tim (akses penuh): menjadwalkan rapat, menulis dan memfinalkan notulen, serta mengelola anggota kelompok.</p>
      )}
    </>
  );
  const actions = (primary: string, onPrimary: () => void, disabled: boolean) => (
    <div className="flex gap-2">
      <button type="button" className={btnPrimary} disabled={busy || disabled} onClick={onPrimary}>{primary}</button>
      <button type="button" className={btnGhost} onClick={() => { setMode("view"); setError(""); }}>Batal</button>
    </div>
  );
  const link = "rounded-lg px-3 py-1.5 text-xs font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)] disabled:opacity-50";

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] p-4">
      <h3 className="text-[13px] font-extrabold uppercase tracking-[0.07em] text-[var(--gold-ink)]">Akun login</h3>

      {acc && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span>{acc.email}</span>
            <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${acc.isActive ? "bg-[#E3F4E8] text-[#1B6B34]" : "bg-[#ECEEF4] text-[#565b76]"}`}>{acc.isActive ? "Aktif" : "Nonaktif"}</span>
            {acc.mustChangePassword && <span className="whitespace-nowrap rounded-full bg-[var(--gold-soft)] px-2.5 py-0.5 text-xs font-bold text-[#6F4304]">Belum ganti kata sandi</span>}
          </div>
          <p className="text-sm font-medium text-[var(--ink-2)]">Role: {roleText}{acc.teamTypeId && teamName(acc.teamTypeId) ? ` · ${teamName(acc.teamTypeId)}` : ""}</p>
          {mode === "view" && !lockedSuper && (
            <div className="-ml-3 flex flex-wrap gap-1">
              <button type="button" className={link} disabled={busy} onClick={() => open("role")}>Ubah role</button>
              <button type="button" className={link} disabled={busy} onClick={() => open("reset")}>Reset kata sandi</button>
              {acc.isActive
                ? <button type="button" onClick={() => toggle(false)} disabled={busy} className="rounded-lg px-3 py-1.5 text-xs font-bold text-[#9B1C1C] hover:bg-[#FFF5F5]">Nonaktifkan</button>
                : <button type="button" className={link} disabled={busy} onClick={() => toggle(true)}>Aktifkan kembali</button>}
            </div>
          )}
          {lockedSuper && <p className="text-xs font-medium text-[var(--ink-2)]">Akun Superadmin hanya bisa diubah oleh Superadmin.</p>}
        </div>
      )}

      {acc && mode === "role" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{roleFields}</div>
          {actions("Simpan role", saveRole, role === "ADMIN_TIM" && !teamId)}
        </div>
      )}
      {acc && mode === "reset" && (
        <div className="flex flex-col gap-3">
          {passwordField("Minimal 8 karakter. Orangnya wajib menggantinya saat masuk.")}
          {actions("Reset kata sandi", reset, password.length < 8)}
        </div>
      )}

      {!acc && mode === "create" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Email"><input type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></Field>
            {passwordField("Minimal 8 karakter. Orangnya akan diminta menggantinya saat pertama masuk.")}
            {roleFields}
          </div>
          {actions("Buat akun", create, !email || password.length < 8 || (role === "ADMIN_TIM" && !teamId))}
        </div>
      )}
      {!acc && mode === "view" && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-[var(--ink-2)]">Belum punya akun. Tanpa akun, orang ini tetap bisa dijadwalkan.</span>
          <button type="button" className={btnGhost} onClick={() => open("create")}>Buat akun</button>
        </div>
      )}

      {note && <p className="rounded-xl bg-[#F3F4FB] px-3.5 py-2.5 text-sm font-medium text-[var(--primary-ink)]">{note}</p>}
      {issued && <IssuedPassword email={issued.email} password={issued.password} />}
      {error && <p className="text-sm font-semibold text-[#9B1C1C]" role="alert">{error}</p>}
    </section>
  );
}
