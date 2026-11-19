import { redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import NewEvent from "@/components/jadwal/NewEvent";
import { can } from "@/lib/rbac";

export default async function BaruPage() {
  const u = await currentUser();
  if (!can(u, "event.write")) redirect("/jadwal");
  return (
    <AppShell active="jadwal" title="Buat jadwal" subtitle="Dari template atau acara khusus">
      <NewEvent />
    </AppShell>
  );
}
