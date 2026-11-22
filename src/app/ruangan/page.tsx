import AppShell, { currentUser } from "@/components/AppShell";
import RoomBoard from "@/components/master/RoomBoard";
import NewRoomButton from "@/components/master/NewRoomButton";
import { can } from "@/lib/rbac";
import { canSeeMeetingSchedule } from "@/lib/groups";

export default async function RuanganPage() {
  const u = await currentUser();
  const canManage = can(u, "master.write");
  const canOpenEvents = can(u, "event.write") || can(u, "assignment.write");
  const canOpenMeetings = await canSeeMeetingSchedule(u); // rapat hanya bisa dibuka anggota kelompok dan Penjadwal
  return (
    <AppShell active="ruangan" title="Ruangan" subtitle="Pemakaian ruangan untuk ibadah, latihan, dan rapat" actions={canManage ? <NewRoomButton /> : null}>
      <RoomBoard canManage={canManage} canOpenEvents={canOpenEvents} canOpenMeetings={canOpenMeetings} />
    </AppShell>
  );
}
