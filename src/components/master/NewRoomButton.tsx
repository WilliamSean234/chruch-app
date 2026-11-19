"use client";

import Fab from "@/components/ui/Fab";
import { NEW_ROOM_EVENT } from "./RoomBoard";

/** Tombol di header halaman Ruangan; membuka dialog di papan ruangan lewat event window. */
export default function NewRoomButton() {
  return (
    <>
    <button type="button" onClick={() => window.dispatchEvent(new Event(NEW_ROOM_EVENT))}
      className="flex h-[46px] items-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:brightness-110 max-md:hidden">＋ Ruangan baru</button>
    <Fab actions={[{ key: "new", label: "Ruangan baru", icon: "plus", event: NEW_ROOM_EVENT }]} />
    </>
  );
}
