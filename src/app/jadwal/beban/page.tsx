import { redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import LoadStats from "@/components/jadwal/LoadStats";
import { can } from "@/lib/rbac";

export default async function BebanPage() {
  const u = await currentUser();
  if (!can(u, "assignment.write")) redirect("/");
  return (
    <AppShell active="jadwal" title="Beban pelayan" subtitle="Berapa ibadah tiap orang bertugas" back={{ href: "/jadwal", label: "Jadwal acara" }}>
      <LoadStats />
    </AppShell>
  );
}
