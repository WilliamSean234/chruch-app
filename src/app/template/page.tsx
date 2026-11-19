import { redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import TemplateManager from "@/components/master/TemplateManager";
import { can } from "@/lib/rbac";

export default async function TemplatePage() {
  const u = await currentUser();
  if (!can(u, "template.write")) redirect("/");
  return (
    <AppShell active="template" title="Template acara" subtitle="Acara rutin, waktu default, dan tim bawaannya">
      <TemplateManager />
    </AppShell>
  );
}
