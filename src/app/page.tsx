import AppShell, { currentUser } from "@/components/AppShell";
import Fab from "@/components/ui/Fab";
import CalendarView from "@/components/calendar/CalendarView";
import Link from "next/link";
import { can, teamScope } from "@/lib/rbac";

export default async function KalenderPage() {
  const u = await currentUser();
  // Rapat yang tampil di kalender ditentukan per rapat oleh server: khusus anggota kelompok, atau semua orang (lihat meetingViewer).
  const canSeeMeetings = true;
  return (
    <AppShell
      active="kalender" title="Kalender pelayanan" subtitle="Semua jadwal pelayanan dalam satu tampilan"
      actions={can(u, "event.write") ? <><Link href="/jadwal/baru" className="flex h-[46px] items-center gap-2 rounded-xl bg-[var(--primary)] px-5 text-sm font-bold text-white hover:brightness-110 max-md:hidden">＋ Buat jadwal</Link><Fab actions={[{ key: "new", label: "Buat jadwal", icon: "plus", href: "/jadwal/baru" }]} /></> : null}
    >
      <CalendarView
        canFilter canSeeMeetings={canSeeMeetings} canSeeCancelled={can(u, "event.publish")} canEdit={can(u, "assignment.write")} hasPerson={!!u.personId} myPersonId={u.personId}
        drop={can(u, "assignment.write") ? { addSeat: can(u, "event.write"), override: can(u, "booking.override"), scope: teamScope(u) } : null}
      />
    </AppShell>
  );
}
