import Link from "next/link";
import Fab from "@/components/ui/Fab";
import AppShell, { currentUser } from "@/components/AppShell";
import MeetingList from "@/components/meetings/MeetingList";
import { schedulableGroups } from "@/lib/meetings";

export default async function RapatPage() {
  const u = await currentUser();
  const canSchedule = (await schedulableGroups(u)).length > 0;
  return (
    <AppShell active="rapat" title="Rapat" subtitle="Rapat kelompok dan peminjaman ruangan"
      actions={canSchedule ? <><Link href="/rapat/baru" className="flex h-[46px] items-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:brightness-110 max-md:hidden">＋ Buat rapat</Link><Fab actions={[{ key: "new", label: "Buat rapat", icon: "plus", href: "/rapat/baru" }]} /></> : null}>
      <MeetingList />
    </AppShell>
  );
}
