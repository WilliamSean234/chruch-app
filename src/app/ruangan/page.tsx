import { redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import RoomBoard from "@/components/master/RoomBoard";
import NewRoomButton from "@/components/master/NewRoomButton";
import { can } from "@/lib/rbac";
import { canViewRooms } from "@/lib/roomAccess";

export default async function RuanganPage() {
  const u = await currentUser();
  if (!(await canViewRooms(u))) redirect("/");
  const canManage = can(u, "master.write");
  const canOpenEvents = can(u, "event.write") || can(u, "assignment.write");
  return (
    <AppShell active="ruangan" title="Ruangan" subtitle="Pemakaian ruangan untuk ibadah, latihan, dan rapat" actions={canManage ? <NewRoomButton /> : null}>
      <RoomBoard canManage={canManage} canOpenEvents={canOpenEvents} />
    </AppShell>
  );
}
