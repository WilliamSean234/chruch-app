"use client";

import Fab from "@/components/ui/Fab";
import { NEW_GROUP_EVENT } from "./GroupBoard";

/** Tombol di header halaman Kelompok; membuka dialog di papan kelompok lewat event window. */
export default function NewGroupButton() {
  return (
    <>
    <button type="button" onClick={() => window.dispatchEvent(new Event(NEW_GROUP_EVENT))}
      className="flex h-[46px] items-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:brightness-110 max-md:hidden">＋ Kelompok baru</button>
    <Fab actions={[{ key: "new", label: "Kelompok baru", icon: "plus", event: NEW_GROUP_EVENT }]} />
    </>
  );
}
