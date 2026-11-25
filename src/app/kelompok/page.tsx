import { redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import GroupBoard from "@/components/groups/GroupBoard";
import NewGroupButton from "@/components/groups/NewGroupButton";
import { isInAnyGroup } from "@/lib/groups";
import { canManagePeople, isSuperadmin } from "@/lib/rbac";

export default async function KelompokPage() {
  const u = await currentUser();
  const sa = isSuperadmin(u);
  if (!sa && !(await isInAnyGroup(u))) redirect("/");
  return (
    <AppShell active="kelompok" title="Kelompok" subtitle="Kelompok rapat, jabatan, dan anggotanya" actions={sa ? <NewGroupButton /> : null}>
      <GroupBoard isSuperadmin={sa} canAddPerson={canManagePeople(u)} />
    </AppShell>
  );
}
