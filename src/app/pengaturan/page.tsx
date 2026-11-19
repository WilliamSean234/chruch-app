import { redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import SettingsTabs, { SETTINGS_TABS, type SettingsTab } from "@/components/settings/SettingsTabs";
import ImportPanel from "@/components/settings/ImportPanel";
import AccountsPanel from "@/components/settings/AccountsPanel";
import AuditPanel from "@/components/settings/AuditPanel";
import ChurchProfilePanel from "@/components/settings/ChurchProfilePanel";
import { stickyPage } from "@/components/ui/sticky";
import { getChurchProfile } from "@/lib/church";
import { can, isSuperadmin } from "@/lib/rbac";

export default async function PengaturanPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const u = await currentUser();
  if (!can(u, "user.manage")) redirect("/");
  const q = (await searchParams).tab;
  const sup = isSuperadmin(u);
  const tab: SettingsTab = SETTINGS_TABS.find((t) => t.key === q && t.ready && (!t.superOnly || sup))?.key ?? "impor";
  return (
    <AppShell active="pengaturan" title="Pengaturan" subtitle="Impor data, akun, dan catatan aktivitas">
      {/* Tab menempel di bawah header; filter di tiap panel menempel tepat di bawah tab (74px = tinggi bar tab). */}
      <div className={`${stickyPage} !z-[25]`}><SettingsTabs active={tab} isSuper={sup} /></div>
      <div style={{ "--stick-top": "74px" } as React.CSSProperties}>
        {tab === "impor" && <ImportPanel />}
        {tab === "akun" && <AccountsPanel selfId={u.userId} isSuper={sup} />}
        {tab === "log" && <AuditPanel />}
        {tab === "profil" && <ChurchProfilePanel initial={await getChurchProfile(u.tenantId)} />}
      </div>
    </AppShell>
  );
}
