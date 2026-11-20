import { redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import TeamSchedulePanel from "@/components/jadwal/TeamSchedulePanel";
import { can } from "@/lib/rbac";

export default async function JadwalTimPage() {
  const u = await currentUser();
  if (!can(u, "assignment.write")) redirect("/");
  return (
    <AppShell active="jadwal" title="Jadwal tim EBM" subtitle="Unggah jadwal setahun, lalu bagikan ke grup" back={{ href: "/jadwal", label: "Jadwal acara" }}>
      <TeamSchedulePanel />
    </AppShell>
  );
}
