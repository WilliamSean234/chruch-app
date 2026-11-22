import { redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import RuleCheckList from "@/components/jadwal/RuleCheckList";
import { can } from "@/lib/rbac";

export default async function PemeriksaanPage() {
  const u = await currentUser();
  if (!can(u, "assignment.write") && !can(u, "event.write")) redirect("/");
  return (
    <AppShell active="jadwal" title="Pemeriksaan aturan" subtitle="Acara yang isinya menyimpang dari aturan penjadwalan" back={{ href: "/jadwal", label: "Jadwal acara" }}>
      <RuleCheckList />
    </AppShell>
  );
}
