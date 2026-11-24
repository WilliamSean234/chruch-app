import { redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import TeamSchedulePanel from "@/components/jadwal/TeamSchedulePanel";
import { can } from "@/lib/rbac";
import { availableFormats } from "@/lib/teamSchedule";

export default async function JadwalTimPage() {
  const u = await currentUser();
  if (!can(u, "assignment.write")) redirect("/");
  // hanya tim yang boleh diatur pengguna ini (Admin Tim hanya timnya sendiri)
  const formats = await availableFormats(u);
  if (!formats.length) redirect("/jadwal");
  return (
    <AppShell active="jadwal" title="Jadwal tim" subtitle="Unggah dan bagikan jadwal setahun per tim" back={{ href: "/jadwal", label: "Jadwal acara" }}>
      <TeamSchedulePanel formats={formats} />
    </AppShell>
  );
}
