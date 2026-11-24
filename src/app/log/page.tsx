import { redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import AuditPanel from "@/components/settings/AuditPanel";
import { can } from "@/lib/rbac";

/** Log aktivitas untuk Pengawas (hanya membaca). Superadmin memakai tab Log di Pengaturan. */
export default async function LogPage() {
  const u = await currentUser();
  if (!can(u, "audit.read")) redirect("/");
  return (
    <AppShell active="log" title="Log aktivitas" subtitle="Catatan siapa mengubah apa">
      <AuditPanel />
    </AppShell>
  );
}
