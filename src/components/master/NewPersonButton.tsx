"use client";

import Fab from "@/components/ui/Fab";
import { NEW_PERSON_EVENT } from "./PeopleView";

/** Tombol di header halaman Orang; membuka form tambah orang lewat event window. */
export default function NewPersonButton() {
  return (
    <>
    <button type="button" onClick={() => window.dispatchEvent(new Event(NEW_PERSON_EVENT))}
      className="flex h-[46px] items-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:brightness-110 max-md:hidden">＋ Orang baru</button>
    <Fab actions={[{ key: "new", label: "Orang baru", icon: "plus", event: NEW_PERSON_EVENT }]} />
    </>
  );
}
