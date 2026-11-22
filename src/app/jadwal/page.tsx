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
      actions={
        <>
          <Link href="/jadwal/tim" className="flex h-[46px] items-center gap-2 rounded-xl border border-[#D0D3E8] bg-white px-5 text-sm font-bold text-[var(--primary-ink)] hover:bg-[#f3f4f9] max-md:hidden">Jadwal tim</Link>
          <Link href="/jadwal/pemeriksaan" className="flex h-[46px] items-center gap-2 rounded-xl border border-[#D0D3E8] bg-white px-5 text-sm font-bold text-[var(--primary-ink)] hover:bg-[#f3f4f9] max-md:hidden">Pemeriksaan aturan</Link>
          {can(u, "event.write") ? <Link href="/jadwal/baru" className="flex h-[46px] items-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:brightness-110 max-md:hidden">＋ Buat jadwal</Link> : null}
          <Fab actions={[...(can(u, "event.write") ? [{ key: "new", label: "Buat jadwal", icon: "plus" as const, href: "/jadwal/baru" }] : []), { key: "tim", label: "Jadwal tim", icon: "edit" as const, tone: "neutral" as const, href: "/jadwal/tim" }, { key: "aturan", label: "Pemeriksaan aturan", icon: "check" as const, tone: "neutral" as const, href: "/jadwal/pemeriksaan" }]} />
        </>
      }
    >
      <EventList />
    </AppShell>
  );
}
