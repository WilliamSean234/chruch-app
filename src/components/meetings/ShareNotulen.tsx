"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/master/Modal";
import { showToast } from "@/components/ui/Toast";
import { btnGhost, btnPrimary } from "@/components/jadwal/api";
import { imageFileName, renderNotulenPages, type NotulenImageData } from "@/lib/notulenImage";

const WA_GREEN = "#1FA855";

export const WhatsAppIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 004.74 1.21c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 01-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 4.54 0 8.24 3.7 8.24 8.24s-3.7 8.24-8.24 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07s.89 2.4 1.01 2.56c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.17-.48-.29z" />
  </svg>
);

/**
 * Bagikan notulen Final sebagai gambar (bukan PDF) supaya bisa dibuka langsung di WhatsApp, juga di HP lama.
 * Gambar dibuat di browser. Di HP, tombol "Bagikan" membuka daftar aplikasi (pilih WhatsApp); di komputer gambar bisa diunduh atau disalin.
 */
export default function ShareNotulen({ data, dateIso, disabled }: { data: NotulenImageData; dateIso: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [canShare, setCanShare] = useState(false);
  const urlsRef = useRef<string[]>([]);

  const revoke = () => { urlsRef.current.forEach((u) => URL.revokeObjectURL(u)); urlsRef.current = []; };
  useEffect(() => revoke, []);

  const start = async () => {
    setOpen(true); setBusy(true); setError(""); setFiles([]); setUrls([]); revoke();
    try {
      const blobs = await renderNotulenPages(data);
      const fs = blobs.map((b, i) => new File([b], imageFileName(data.group, dateIso, i + 1, blobs.length), { type: "image/png" }));
      const us = fs.map((f) => URL.createObjectURL(f));
      urlsRef.current = us;
      setFiles(fs); setUrls(us);
      setCanShare(typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: fs }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat gambar notulen.");
    }
    setBusy(false);
  };

  const caption = `Notulen Rapat ${data.group}: ${data.topic} (${data.dateText})`;
  const share = async () => {
    try { await navigator.share({ files, title: caption, text: caption }); }
    catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setError("Tidak bisa membuka menu bagikan di perangkat ini. Unduh gambarnya lalu kirim lewat WhatsApp."); }
  };
  const download = (i: number) => {
    const a = document.createElement("a");
    a.href = urls[i]; a.download = files[i].name; document.body.appendChild(a); a.click(); a.remove();
  };
  const downloadAll = async () => { for (let i = 0; i < files.length; i++) { download(i); await new Promise((r) => setTimeout(r, 350)); } };
  const copy = async (i: number) => {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": files[i] })]);
      showToast("Gambar disalin. Tempel (Ctrl+V) di kolom chat WhatsApp.");
    } catch { showToast("Browser ini tidak bisa menyalin gambar. Gunakan Unduh.", "error"); }
  };
  const canCopy = typeof ClipboardItem !== "undefined" && !!navigator.clipboard?.write;

  return (
    <>
      <button type="button" onClick={start} disabled={disabled}
        className={`${btnGhost} flex !h-[46px] items-center gap-2 !px-[18px] disabled:opacity-50`}>
        <span style={{ color: WA_GREEN }}><WhatsAppIcon /></span>
        Bagikan ke WhatsApp
      </button>

      {open && (
        <Modal title="Bagikan notulen ke WhatsApp" wide onClose={() => setOpen(false)}
          footer={<>
            <button type="button" onClick={() => setOpen(false)} className={btnGhost}>Tutup</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(caption)}`} target="_blank" rel="noopener noreferrer" className={`${btnGhost} flex items-center gap-2`}><span style={{ color: WA_GREEN }}><WhatsAppIcon size={16} /></span>Buka WhatsApp</a>
            <button type="button" onClick={downloadAll} disabled={busy || files.length === 0} className={btnGhost}>{files.length > 1 ? `Unduh ${files.length} gambar` : "Unduh gambar"}</button>
            {canShare && <button type="button" onClick={share} disabled={busy} className={`${btnPrimary} flex items-center gap-2`}><WhatsAppIcon size={16} />Bagikan</button>}
          </>}>
          <div className="flex flex-col gap-4">
            <p className="m-0 text-[13.5px] font-medium leading-relaxed text-[var(--ink-2)]">
              {canShare
                ? "Tekan Bagikan, lalu pilih WhatsApp dan kontak atau grupnya. Gambar besar dan jelas, jadi mudah dibaca di HP orang tua."
                : "Unduh atau salin gambar di bawah, lalu lampirkan di chat WhatsApp (di komputer: buka WhatsApp Web, lalu tempel atau seret gambarnya)."}
            </p>
            <p className="m-0 rounded-xl border border-[#EAD9AE] bg-[#FFFBF0] px-3.5 py-2.5 text-[12.5px] font-semibold leading-relaxed text-[#6F4304]">
              Notulen ini tertutup untuk anggota {data.group}. Kirim hanya ke orang atau grup yang memang berhak membacanya.
            </p>
            {busy && <p role="status" className="m-0 text-sm font-semibold text-[var(--ink-2)]">Menyiapkan gambar…</p>}
            {error && <p role="alert" className="m-0 text-sm font-semibold text-[#9b1c1c]">{error}</p>}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
              {urls.map((u, i) => (
                <figure key={u} className="m-0 flex flex-col gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={`Halaman ${i + 1} dari ${urls.length}`} className="w-full rounded-xl border border-[var(--line)] bg-white" />
                  <figcaption className="flex items-center justify-between gap-2 text-[12.5px] font-bold text-[var(--ink-2)]">
                    <span>Halaman {i + 1} dari {urls.length}</span>
                    <span className="flex gap-1">
                      {canCopy && <button type="button" onClick={() => copy(i)} className="h-8 rounded-lg px-2.5 text-[12.5px] font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Salin</button>}
                      <button type="button" onClick={() => download(i)} className="h-8 rounded-lg px-2.5 text-[12.5px] font-bold text-[var(--primary-ink)] hover:bg-[var(--primary-soft)]">Unduh</button>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
