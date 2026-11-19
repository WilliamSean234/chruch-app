import Link from "next/link";
import Fab from "@/components/ui/Fab";
import { redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import EventList from "@/components/jadwal/EventList";
import { can } from "@/lib/rbac";

export default async function JadwalPage() {
  const u = await currentUser();
  if (!can(u, "assignment.write") && !can(u, "event.write")) redirect("/");
  return (
    <AppShell
      active="jadwal" title="Jadwal acara" subtitle="Semua acara, dari draf sampai terbit"
      actions={can(u, "event.write") ? <><Link href="/jadwal/baru" className="flex h-[46px] items-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:brightness-110 max-md:hidden">＋ Buat jadwal</Link><Fab actions={[{ key: "new", label: "Buat jadwal", icon: "plus", href: "/jadwal/baru" }]} /></> : null}
    >
      <EventList />
    </AppShell>
  );
}
