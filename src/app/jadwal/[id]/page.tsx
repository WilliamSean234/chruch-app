import AppShell, { currentUser } from "@/components/AppShell";
import EventEditor from "@/components/jadwal/EventEditor";
import { can, canManagePeople, teamScope } from "@/lib/rbac";
import { redirect } from "next/navigation";

export default async function EditJadwalPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!can(u, "assignment.write") && !can(u, "event.write")) redirect("/");
  const { id } = await params;
  return (
    <AppShell active="jadwal" title="Jadwal acara" subtitle="Atur siapa bertugas, latihan, dan ruangan">
      <EventEditor
        eventId={id}
        perms={{ editEvent: can(u, "event.write"), assign: can(u, "assignment.write"), rehearsal: can(u, "rehearsal.write"), publish: can(u, "event.publish"), override: can(u, "booking.override"), addPerson: canManagePeople(u), scope: teamScope(u) }}
      />
    </AppShell>
  );
}
