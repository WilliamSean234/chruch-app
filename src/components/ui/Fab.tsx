"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Tombol aksi mengambang untuk HP (disembunyikan di layar md ke atas; desktop tetap memakai tombol biasa di halaman).
 *
 * - Satu aksi saja → tombol bulat langsung menjalankannya.
 * - Beberapa aksi → tombol bulat membuka daftar pilihan ke atas, tiap pilihan berlabel dan berwarna sesuai perannya.
 * - `quick` = kunci aksi yang dijadikan tombol utama selagi perlu (mis. "save" saat ada perubahan belum tersimpan);
 *   aksi lain tetap ada di tombol kecil "⋯" di atasnya. `dot` menampilkan titik penanda di tombol utama.
 *
 * Aksi bisa berupa `href` (tautan), `event` (nama event window, untuk membuka dialog di komponen lain) atau `onClick`.
 * Tidak ada tombol yang disembunyikan karena tidak berhak: pemanggil cukup tidak menyertakan aksi itu.
 *
 * Dirender lewat portal ke <body>: elemen induk dengan backdrop-filter/transform/filter (mis. header yang blur)
 * menjadi acuan posisi bagi `fixed`, sehingga tombol akan menempel di induk itu, bukan di sudut layar.
 */
export type FabTone = "primary" | "gold" | "danger" | "neutral";
export type FabIcon = "plus" | "save" | "publish" | "unpublish" | "cancel" | "check" | "print" | "edit" | "more";
export type FabAction = {
  key: string; label: string; icon?: FabIcon; tone?: FabTone;
  href?: string; event?: string; onClick?: () => void;
  disabled?: boolean; busy?: boolean;
};

const TONE: Record<FabTone, string> = {
  primary: "bg-[var(--primary)] text-white",
  gold: "bg-[var(--gold)] text-white",
  danger: "bg-[#B42318] text-white",
  neutral: "border border-[var(--line)] bg-white text-[var(--primary-ink)]",
};

const PATHS: Record<FabIcon, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  save: <><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4M8 20v-6h8v6" /></>,
  publish: <path d="M4 12l5 5L20 6" />,
  unpublish: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></>,
  cancel: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M4 12l5 5L20 6" />,
  print: <><path d="M7 9V4h10v5" /><path d="M7 17H5v-6h14v6h-2" /><path d="M7 14h10v6H7z" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></>,
  more: <><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></>,
};

function Icon({ name, size = 24 }: { name: FabIcon; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
  );
}

const Spinner = () => <span className="size-5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />;

/** Satu tombol bulat (bisa tautan atau tombol). */
function Round({ a, size, onDone }: { a: FabAction; size: "lg" | "md"; onDone?: () => void }) {
  const dim = size === "lg" ? "size-14" : "size-12";
  const cls = `${dim} grid flex-none place-items-center rounded-full shadow-[0_6px_18px_rgba(23,26,44,0.28)] transition active:scale-95 ${a.disabled ? "bg-[#d6d8e6] text-white" : TONE[a.tone ?? "primary"]} ${a.disabled || a.busy ? "pointer-events-none" : ""}`;
  const inner = a.busy ? <Spinner /> : <Icon name={a.icon ?? "plus"} size={size === "lg" ? 26 : 22} />;
  if (a.href && !a.disabled) return <Link href={a.href} aria-label={a.label} className={cls} onClick={onDone}>{inner}</Link>;
  return (
    <button type="button" aria-label={a.label} aria-disabled={a.disabled || undefined} disabled={a.disabled || a.busy} className={cls}
      onClick={() => { onDone?.(); if (a.event) window.dispatchEvent(new Event(a.event)); a.onClick?.(); }}>
      {inner}
    </button>
  );
}

export default function Fab({ actions, quick, dot = false, noTabs = false }: { actions: FabAction[]; quick?: string; dot?: boolean; noTabs?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (actions.length === 0 || !mounted) return null;

  const q = quick ? actions.find((a) => a.key === quick && !a.disabled) : undefined;
  const menuItems = q ? actions.filter((a) => a !== q) : actions;
  const single = !q && actions.length === 1 ? actions[0] : undefined;
  const hasMenu = menuItems.length > 0 && !single;
  const main: FabAction = q ?? single ?? { key: "__menu", label: open ? "Tutup menu aksi" : "Buka menu aksi", icon: open ? "cancel" : "more", tone: "primary" };
  const bottom = noTabs ? "bottom-[calc(20px+env(safe-area-inset-bottom))]" : "bottom-[calc(84px+env(safe-area-inset-bottom))]";

  return createPortal(
    <>
      {open && <div className="fixed inset-0 z-[41] bg-[rgba(23,26,44,0.35)] md:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}
      <div className={`fixed right-4 ${bottom} z-[42] flex flex-col items-end gap-3 md:hidden`}>
        {open && hasMenu && (
          <ul className="flex flex-col items-end gap-3" aria-label="Aksi halaman">
            {menuItems.map((a) => (
              <li key={a.key} className="flex items-center gap-3">
                <span className={`rounded-full bg-white px-3.5 py-2 text-[13px] font-bold shadow-[0_2px_8px_rgba(23,26,44,0.18)] ${a.disabled ? "text-[var(--ink-2)] opacity-70" : "text-[var(--ink)]"}`}>{a.label}</span>
                <Round a={a} size="md" onDone={() => setOpen(false)} />
              </li>
            ))}
          </ul>
        )}
        {q && hasMenu && !open && (
          <Round a={{ key: "__more", label: "Aksi lainnya", icon: "more", tone: "neutral" }} size="md" onDone={() => setOpen(true)} />
        )}
        <div className="relative">
          {main.key === "__menu"
            ? <Round a={{ ...main, onClick: () => setOpen((v) => !v) }} size="lg" />
            : <Round a={main} size="lg" onDone={() => setOpen(false)} />}
          {dot && !main.disabled && <span className="absolute right-0.5 top-0.5 size-3.5 rounded-full border-2 border-white bg-[var(--gold)]" aria-hidden="true" />}
        </div>
      </div>
    </>,
    document.body,
  );
}
