import { redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import PeopleView from "@/components/master/PeopleView";
import NewPersonButton from "@/components/master/NewPersonButton";
import { can, canManagePeople, isSuperadmin, teamScope } from "@/lib/rbac";

export default async function OrangPage() {
  const u = await currentUser();
  if (!can(u, "person.write")) redirect("/");
  return (
    <AppShell active="orang" title="Orang & pelayanan" subtitle="Daftar jemaat dan pelayanan yang bisa mereka isi" actions={canManagePeople(u) ? <NewPersonButton /> : null}>
      <PeopleView scope={teamScope(u)} canAccount={can(u, "user.manage")} canMaster={can(u, "master.write")} isSuper={isSuperadmin(u)} canGroups={can(u, "person.write")} canManagePeople={canManagePeople(u)} />
    </AppShell>
  );
}
