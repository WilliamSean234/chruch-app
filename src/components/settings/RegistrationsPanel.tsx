"use client";

import { useEffect, useState } from "react";
import Modal, { Field } from "@/components/master/Modal";
import NewPersonInline from "@/components/master/NewPersonInline";
import { btnGhost, btnPrimary, callApi, errMsg, inputCls } from "@/components/jadwal/api";
import { Alert, FilterBar, FSearch, FSelect, listCard } from "@/components/ui/Filters";
import Pager from "@/components/ui/Pager";
import { useDebounced, usePagedList } from "@/components/ui/usePagedList";

type Row = { id: string; name: string; email: string; status: "PENDING" | "APPROVED" | "REJECTED"; createdAt: string; decidedAt: string | null; personName: string | null; rejectReason: string | null };
type Cand = { id: string; name: string; sub: string | null };

const stamp = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const STATUS: Record<Row["status"], { text: string; bg: string; fg: string }> = {
  PENDING: { text: "Menunggu", bg: "#FBF0D9", fg: "#6F4304" },
  APPROVED: { text: "Disetujui", bg: "#E3F3E7", fg: "#1B6B34" },
  REJECTED: { text: "Ditolak", bg: "#FBE4E4", fg: "#9B1C1C" },
};
const ROLES = [
  { code: "NONE", label: "Anggota biasa", hint: "Melihat kalender dan jadwalnya sendiri." },
  { code: "PETUGAS_ABSEN", label: "Petugas absen", hint: "Mengisi kehadiran acara yang ditugaskan kepadanya." },
  { code: "PENJADWAL", label: "Penjadwal", hint: "Membuat dan menerbitkan jadwal." },
];

/** Tab "Permintaan daftar" di Pengaturan: orang yang mendaftar sendiri lewat halaman Daftar menunggu persetujuan admin. */
export default function RegistrationsPanel() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("PENDING");
  const search = useDebounced(q.trim());
  const list = usePagedList<Row, { pending: number }>("/api/v1/registrations", { search, status: status || "ALL" });
  const [approve, setApprove] = useState<Row | null>(null);
  const [reject, setReject] = useState<Row | null>(null);
  const [msg, setMsg] = useState("");
  const dirty = !!(q || status !== "PENDING");

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[13.5px] font-medium leading-relaxed text-[var(--ink-2)]">
        Orang yang mendaftar lewat halaman Daftar muncul di sini. Saat menyetujui, tautkan ke data orang yang sudah ada supaya tidak dobel; buat orang baru hanya bila memang belum ada.
      </p>
      <FilterBar active={dirty} onReset={() => { setQ(""); setStatus("PENDING"); }}>
        <FSearch value={q} onChange={setQ} placeholder="Nama atau email" />
        <FSelect label="Status" value={status} onChange={setStatus} allLabel="Semua status" width="w-44"
          options={[{ value: "PENDING", label: "Menunggu" }, { value: "APPROVED", label: "Disetujui" }, { value: "REJECTED", label: "Ditolak" }]} />
      </FilterBar>

      {msg && <p role="status" className="rounded-xl border border-[#BFE3C9] bg-[#EEF9F1] px-4 py-3 text-sm font-semibold text-[#1B6B34]">{msg}</p>}
      {list.error && <Alert>{list.error}</Alert>}

      <section className={listCard} aria-busy={list.loading}>
        {list.items === null && <p className="px-6 py-10 text-center text-sm font-semibold text-[var(--ink-2)]">Memuat…</p>}
        {list.items?.length === 0 && !list.error && (
          <p className="px-6 py-10 text-center text-sm font-semibold text-[var(--ink-2)]">{dirty ? "Tidak ada permintaan yang cocok dengan filter ini." : "Tidak ada permintaan yang menunggu."}</p>
        )}
        {list.items?.map((r) => {
          const st = STATUS[r.status];
          return (
            <div key={r.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-[var(--line-2)] px-5 py-4 last:border-b-0">
              <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-extrabold">{r.name}</span>
                  <span className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-extrabold" style={{ background: st.bg, color: st.fg }}>{st.text}</span>
                </span>
                <span className="break-all text-[13px] font-semibold text-[var(--ink-2)]">{r.email}</span>
                <span className="text-[12.5px] font-medium text-[var(--ink-2)]">
                  Diminta {stamp(r.createdAt)}
                  {r.status === "APPROVED" && r.personName ? ` · ditautkan ke ${r.personName}` : ""}
                  {r.status === "REJECTED" && r.rejectReason ? ` · alasan: ${r.rejectReason}` : ""}
                </span>
              </div>
              {r.status === "PENDING" && (
                <div className="flex flex-none gap-2 max-md:w-full">
                  <button type="button" onClick={() => setApprove(r)} className={`${btnPrimary} !h-10 whitespace-nowrap max-md:flex-1`}>Setujui</button>
                  <button type="button" onClick={() => setReject(r)} className="h-10 whitespace-nowrap rounded-xl border border-[#E8C4C4] bg-white px-4 text-sm font-bold text-[#9B1C1C] hover:bg-[#FFF5F5] max-md:flex-1">Tolak</button>
                </div>
              )}
            </div>
          );
        })}
        <Pager page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} noun="permintaan" />
      </section>

      {approve && <ApproveDialog req={approve} onClose={() => setApprove(null)} onDone={(m) => { setApprove(null); setMsg(m); list.reload(); }} />}
      {reject && <RejectDialog req={reject} onClose={() => setReject(null)} onDone={(m) => { setReject(null); setMsg(m); list.reload(); }} />}
    </div>
  );
}

function ApproveDialog({ req, onClose, onDone }: { req: Row; onClose: () => void; onDone: (msg: string) => void }) {
  const [picked, setPicked] = useState<Cand | null>(null);
  const [similar, setSimilar] = useState<Cand[] | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Cand[]>([]);
  const [searched, setSearched] = useState(false);
  const [creating, setCreating] = useState(false);
  const [role, setRole] = useState("NONE");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Saran otomatis: orang tanpa akun yang namanya mirip dengan nama pendaftar.
  useEffect(() => {
    let live = true;
    void callApi("GET", `/api/v1/registrations/${req.id}/matches`).then((r) => {
      if (live) setSimilar(r.ok ? (r.data.items as { id: string; name: string; position: string; cg: string | null }[]).map((p) => ({ id: p.id, name: p.name, sub: [p.position, p.cg].filter(Boolean).join(" · ") })) : []);
    });
    return () => { live = false; };
  }, [req.id]);

  // Pencarian manual di antara orang yang belum punya akun.
  useEffect(() => {
    const term = q.trim();
    if (!term) { setHits([]); setSearched(false); return; }
    let live = true;
    const t = setTimeout(async () => {
      const r = await callApi("GET", `/api/v1/persons?search=${encodeURIComponent(term)}&role=NO_ACCOUNT&pageSize=8`);
      if (live && r.ok) { setHits((r.data.items as { id: string; name: string; title?: string | null; position?: { name: string } }[]).map((p) => ({ id: p.id, name: `${p.title ? p.title + " " : ""}${p.name}`, sub: p.position?.name ?? null }))); setSearched(true); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);

  async function save() {
    if (!picked) return;
    setBusy(true); setErr("");
    const r = await callApi("POST", `/api/v1/registrations/${req.id}/approve`, { personId: picked.id, roleCodes: role === "NONE" ? [] : [role] });
    setBusy(false);
    if (r.ok) onDone(`Akun ${req.email} dibuat dan ditautkan ke ${picked.name}. Orang itu sudah bisa masuk.`);
    else setErr(errMsg(r.data));
  }

  const Pick = ({ c }: { c: Cand }) => (
    <button type="button" onClick={() => setPicked(c)} className="flex w-full flex-col gap-0.5 border-b border-[var(--line-2)] px-3.5 py-2.5 text-left last:border-b-0 hover:bg-[#f6f7fe]">
      <span className="text-sm font-bold">{c.name}</span>
      {c.sub && <span className="text-xs font-medium text-[var(--ink-2)]">{c.sub}</span>}
    </button>
  );

  return (
    <Modal title="Setujui permintaan daftar" onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Batal</button>
        <button type="button" onClick={save} disabled={busy || !picked} className={btnPrimary}>{busy ? "Menyimpan…" : "Setujui dan buat akun"}</button>
      </>}>
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-[var(--surface-2)] px-4 py-3 text-sm">
          <div className="font-extrabold">{req.name}</div>
          <div className="break-all font-medium text-[var(--ink-2)]">{req.email}</div>
        </div>

        {!picked ? (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-extrabold">Tautkan ke orang yang sudah ada</span>
              {similar === null && <span className="text-sm font-medium text-[var(--ink-2)]">Mencari nama yang mirip…</span>}
              {similar !== null && similar.length > 0 && (
                <div className="flex flex-col overflow-hidden rounded-xl border border-[#E7C27A] bg-[#FFFBF0]">
                  <span className="border-b border-[#F0DDB0] px-3.5 py-2 text-xs font-extrabold text-[#6F4304]">Nama yang mirip, belum punya akun</span>
                  {similar.map((c) => <Pick key={c.id} c={c} />)}
                </div>
              )}
              {similar !== null && similar.length === 0 && <span className="text-sm font-medium text-[var(--ink-2)]">Tidak ada nama yang mirip. Cari manual di bawah, atau buat orang baru.</span>}
            </div>

            <Field label="Cari nama lain">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik nama jemaat" className={inputCls} />
            </Field>
            {q.trim() && (
              <div className="-mt-2 flex max-h-56 flex-col overflow-y-auto rounded-xl border border-[var(--line)]">
                {hits.map((c) => <Pick key={c.id} c={c} />)}
                {hits.length === 0 && <span className="px-3.5 py-3 text-sm font-medium text-[var(--ink-2)]">{searched ? "Tidak ada yang cocok (hanya orang yang belum punya akun)." : "Mencari…"}</span>}
              </div>
            )}

            {creating
              ? <NewPersonInline initialName={req.name} onCancel={() => setCreating(false)} onCreated={(p) => { setPicked({ id: p.id, name: `${p.title ? p.title + " " : ""}${p.name}`, sub: "Baru dibuat" }); setCreating(false); }} />
              : <button type="button" onClick={() => setCreating(true)} className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#B9BDDA] px-3 text-sm font-bold text-[var(--primary-ink)] hover:bg-[#f6f7fe]">
                  ＋ Belum ada di data orang: buat “{req.name}”
                </button>}
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#BFE3C9] bg-[#EEF9F1] px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-xs font-extrabold text-[#1B6B34]">Ditautkan ke</span>
              <span className="truncate text-sm font-extrabold">{picked.name}</span>
              {picked.sub && <span className="text-xs font-medium text-[var(--ink-2)]">{picked.sub}</span>}
            </div>
            <button type="button" onClick={() => setPicked(null)} className="h-9 flex-none rounded-lg px-3 text-[13px] font-bold text-[var(--primary-ink)] hover:bg-white">Ganti</button>
          </div>
        )}

        <Field label="Akses akun" hint={ROLES.find((r) => r.code === role)?.hint + " Role lain (Admin Tim, Superadmin) diatur nanti di Kelola akun."}>
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            {ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </Field>
        {err && <p role="alert" className="text-sm font-semibold text-[#9B1C1C]">{err}</p>}
      </div>
    </Modal>
  );
}

function RejectDialog({ req, onClose, onDone }: { req: Row; onClose: () => void; onDone: (msg: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    setBusy(true); setErr("");
    const r = await callApi("POST", `/api/v1/registrations/${req.id}/reject`, { reason: reason.trim() || undefined });
    setBusy(false);
    if (r.ok) onDone(`Permintaan ${req.email} ditolak.`); else setErr(errMsg(r.data));
  }
  return (
    <Modal title="Tolak permintaan daftar" onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={btnGhost}>Batal</button>
        <button type="button" onClick={save} disabled={busy} className="h-11 rounded-xl bg-[#B42323] px-5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50">{busy ? "Menolak…" : "Tolak permintaan"}</button>
      </>}>
      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium leading-relaxed text-[var(--ink-2)]">Permintaan dari <b className="text-[var(--ink)]">{req.name}</b> ({req.email}) ditolak dan kata sandi yang tersimpan dibuang. Orang itu bisa mendaftar lagi bila perlu.</p>
        <Field label="Alasan (boleh kosong, hanya terlihat admin)">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={inputCls} placeholder="Mis. bukan jemaat kami" />
        </Field>
        {err && <p role="alert" className="text-sm font-semibold text-[#9B1C1C]">{err}</p>}
      </div>
    </Modal>
  );
}
