"use client";

import { useCallback, useEffect, useState } from "react";
import { callApi, errMsg } from "@/components/jadwal/api";
import { askConfirm } from "@/components/ui/Confirm";
import { showToast } from "@/components/ui/Toast";
import { AUDIENCE_LABEL, type Audience } from "@/lib/notificationKinds";

type Kind = { kind: string; audience: Audience; label: string; hint: string };
type Info = {
  configured: boolean; publicKey: string | null;
  devices: { id: string; endpoint: string; label: string; createdAt: string }[];
  off: string[]; kinds: Kind[];
};

const btn = "h-11 rounded-xl border border-[#D0D3E8] bg-white px-4 text-sm font-bold text-[var(--primary-ink)] hover:bg-[#f3f4f9] disabled:opacity-50";
const btnMain = "h-11 rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50";

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIos = () => typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
const isStandalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

/** Pengaturan notifikasi di Profil: aktifkan di HP ini, kirim tes, dan pilih jenis yang diterima. */
export default function NotificationSettings() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<string | null>(null); // endpoint perangkat ini, bila sudah berlangganan
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState<string[]>([]);

  const load = useCallback(async () => {
    const r = await callApi("GET", "/api/v1/me/notifications");
    if (!r.ok) { setError(errMsg(r.data)); return; }
    setInfo(r.data); setOff(r.data.off);
  }, []);

  useEffect(() => {
    void load();
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setPerm(supported ? Notification.permission : "unsupported");
    if (supported && process.env.NODE_ENV === "production") {
      void navigator.serviceWorker.ready.then((reg) => reg.pushManager.getSubscription()).then((s) => setMine(s?.endpoint ?? null)).catch(() => undefined);
    }
  }, [load]);

  const enableHere = async () => {
    if (!info?.publicKey) return;
    setBusy(true);
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") { showToast("Izin notifikasi tidak diberikan.", "error"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(info.publicKey) });
      const j = sub.toJSON();
      const r = await callApi("POST", "/api/v1/me/notifications/subscribe", { endpoint: sub.endpoint, keys: { p256dh: j.keys?.p256dh, auth: j.keys?.auth }, userAgent: navigator.userAgent });
      if (!r.ok) { await sub.unsubscribe().catch(() => undefined); showToast(errMsg(r.data), "error"); return; }
      setMine(sub.endpoint); await load();
      showToast("Notifikasi diaktifkan di HP ini");
    } catch {
      showToast("Gagal mengaktifkan notifikasi di perangkat ini.", "error");
    } finally { setBusy(false); }
  };

  const disableHere = async () => {
    if (!(await askConfirm("Matikan notifikasi di HP ini? Anda tidak akan menerima pemberitahuan jadwal di sini lagi.", { danger: true, confirmLabel: "Matikan", title: "Matikan notifikasi" }))) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await callApi("DELETE", "/api/v1/me/notifications/subscribe", { endpoint: sub.endpoint }); await sub.unsubscribe().catch(() => undefined); }
      setMine(null); await load();
      showToast("Notifikasi dimatikan di HP ini");
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    const r = await callApi("POST", "/api/v1/me/notifications/test");
    setBusy(false);
    if (!r.ok) showToast(errMsg(r.data), "error");
    else showToast(r.data.sent > 0 ? "Tes dikirim. Notifikasi akan muncul sebentar lagi." : "Tes tidak berhasil terkirim. Coba aktifkan ulang di HP ini.", r.data.sent > 0 ? "success" : "error");
  };

  const dirty = !!info && [...off].sort().join() !== [...info.off].sort().join();
  const save = async () => {
    setBusy(true);
    const r = await callApi("PATCH", "/api/v1/me/notifications", { off });
    setBusy(false);
    if (!r.ok) { showToast(errMsg(r.data), "error"); return; }
    showToast("Pengaturan notifikasi disimpan");
    await load();
  };

  const head = <div className="flex items-center gap-2.5"><span className="text-xs font-extrabold tracking-[0.07em] text-[#8A6119]">NOTIFIKASI</span><span className="h-px flex-1 bg-[#E8E4D6]" /></div>;
  const box = "flex flex-col gap-3 rounded-[20px] border border-[var(--line)] bg-white p-4";
  if (error) return <section className="flex flex-col gap-2.5">{head}<p className={`${box} text-sm font-semibold text-[var(--ink-2)]`}>{error}</p></section>;
  if (!info) return <section className="flex flex-col gap-2.5">{head}<p className={`${box} text-sm font-semibold text-[var(--ink-2)]`}>Memuat…</p></section>;

  const dev = process.env.NODE_ENV !== "production";
  const ios = isIos();
  let state: React.ReactNode = null;
  if (!info.configured) state = "Notifikasi HP belum diaktifkan oleh pengelola aplikasi.";
  else if (dev) state = "Notifikasi hanya bisa diaktifkan di versi produksi aplikasi.";
  else if (perm === "unsupported") state = ios && !isStandalone()
    ? "Di iPhone, notifikasi hanya bisa diaktifkan setelah aplikasi ditambahkan ke Layar Utama: ketuk tombol Bagikan di Safari, pilih Tambah ke Layar Utama, lalu buka aplikasi dari ikon itu dan kembali ke halaman ini."
    : "Browser ini belum mendukung notifikasi. Di Android gunakan Chrome; di iPhone pasang aplikasi ke Layar Utama.";
  else if (perm === "denied") state = "Notifikasi diblokir untuk aplikasi ini. Aktifkan lagi lewat pengaturan notifikasi di HP atau browser Anda, lalu muat ulang halaman ini.";

  const byAudience = (["PELAYAN", "PENJADWAL", "KELOMPOK"] as Audience[]).map((a) => ({ a, items: info.kinds.filter((k) => k.audience === a) })).filter((g) => g.items.length > 0);
  const here = !!mine && info.devices.some((d) => d.endpoint === mine);

  return (
    <section className="flex flex-col gap-2.5">
      {head}
      <div className={box}>
        {state ? <p className="text-sm font-semibold leading-relaxed text-[var(--ink-2)]">{state}</p> : (
          <>
            <p className="text-sm font-semibold text-[var(--ink-2)]">
              {here ? "Notifikasi aktif di HP ini." : "Notifikasi belum aktif di HP ini."}
              {info.devices.length > 0 && <> Perangkat aktif: {info.devices.map((d) => d.label).join(", ")}.</>}
            </p>
            <div className="flex flex-wrap gap-2">
              {here ? (
                <>
                  <button type="button" className={btn} disabled={busy} onClick={test}>Kirim tes</button>
                  <button type="button" className={btn} disabled={busy} onClick={disableHere}>Matikan di HP ini</button>
                </>
              ) : <button type="button" className={btnMain} disabled={busy} onClick={enableHere}>Aktifkan di HP ini</button>}
            </div>
          </>
        )}

        {byAudience.length > 0 && (
          <div className="flex flex-col gap-4 border-t border-[var(--line-2)] pt-4">
            <span className="text-[13px] font-bold">Pesan yang ingin diterima</span>
            {byAudience.map((g) => (
              <fieldset key={g.a} className="flex flex-col gap-2.5 border-0 p-0">
                <legend className="mb-1 p-0 text-xs font-extrabold uppercase tracking-[0.06em] text-[var(--ink-2)]">{AUDIENCE_LABEL[g.a]}</legend>
                {g.items.map((k) => (
                  <label key={k.kind} className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 size-[18px] flex-none accent-[var(--primary)]" checked={!off.includes(k.kind)}
                      onChange={(e) => setOff((cur) => (e.target.checked ? cur.filter((x) => x !== k.kind) : [...cur, k.kind]))} />
                    <span className="flex flex-col"><span className="text-sm font-bold">{k.label}</span><span className="text-xs font-medium leading-snug text-[var(--ink-2)]">{k.hint}</span></span>
                  </label>
                ))}
              </fieldset>
            ))}
            <button type="button" className={`${btnMain} self-start`} disabled={!dirty || busy} onClick={save}>Simpan pengaturan</button>
          </div>
        )}
      </div>
    </section>
  );
}
