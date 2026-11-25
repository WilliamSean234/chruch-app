"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { showNotice } from "@/components/ui/NoticeHost";
import { showToast } from "@/components/ui/Toast";
import { btnPrimary } from "@/components/jadwal/api";
import { dayLong, hm } from "@/lib/ui";

const eyebrow = "text-xs font-extrabold tracking-[0.07em] text-[var(--gold-ink)]";
const card = "flex flex-col gap-3 rounded-[20px] border border-[var(--line)] bg-white p-5";

/** Tab "Cadangan data" (Superadmin): unduh salinan data gereja ke Excel. Berkas dibuat saat itu juga dan tidak disimpan di server. */
export default function BackupPanel({ last }: { last: { at: string; by: string | null } | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const r = await fetch("/api/v1/backup", { cache: "no-store" });
      if (!r.ok) {
        let msg = "Cadangan belum bisa dibuat. Coba lagi sebentar lagi.";
        try { msg = (await r.json())?.error?.message ?? msg; } catch { /* bukan JSON */ }
        showNotice(msg, "Gagal mengunduh");
        return;
      }
      const name = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "CADANGAN_GEREJA.xlsx";
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      showToast("Cadangan diunduh. Simpan di tempat yang aman.");
      router.refresh();
    } catch {
      showNotice("Koneksi terputus saat membuat cadangan. Coba lagi.", "Gagal mengunduh");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <section className={card}>
        <span className={eyebrow}>CADANGAN DATA</span>
        <p className="m-0 text-[13.5px] font-medium leading-relaxed text-[var(--ink-2)]">
          Satu berkas Excel berisi orang dan pelayanannya, tim dan posisi, ruangan, kelompok CG, template acara, jadwal 12 bulan terakhir beserta petugas dan latihannya, serta daftar akun.
          Gunakan sebagai salinan pengaman milik gereja, di luar Neon dan Vercel.
        </p>
        <p className="m-0 text-[13px] font-semibold">
          {last ? `Terakhir diunduh ${dayLong(last.at)}, ${hm(last.at)}${last.by ? ` oleh ${last.by}` : ""}.` : "Belum pernah diunduh."}
        </p>
        <button type="button" onClick={download} disabled={busy} className={`${btnPrimary} self-start`}>{busy ? "Menyiapkan…" : "Unduh cadangan (Excel)"}</button>
      </section>

      <section className={`${card} !border-[#E7C27A] !bg-[#FFFAF0]`}>
        <span className={eyebrow}>PENTING SEBELUM MENYIMPAN</span>
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] font-medium leading-relaxed">
          <li>Berkas berisi data pribadi jemaat (nama, tanggal lahir, email) dan tidak dikunci kata sandi. Simpan di tempat yang hanya bisa dibuka pengurus berwenang.</li>
          <li>Jangan kirim lewat WhatsApp atau grup, dan hapus salinan di HP atau komputer umum.</li>
          <li>Tidak ikut dicadangkan: isi rapat dan notulen, daftar anggota kelompok rapat, kata sandi, dan kunci enkripsi. Kunci enkripsi rapat harus disimpan terpisah di dua tempat oleh dua orang.</li>
          <li>Ini salinan pengaman, bukan pemulihan sekali klik. Data master bisa dimasukkan lagi lewat Impor data pada database kosong; pemulihan penuh lewat fitur pemulihan Neon.</li>
        </ul>
      </section>
    </div>
  );
}
