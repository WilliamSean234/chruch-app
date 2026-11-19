import Link from "next/link";

export const SETTINGS_TABS: readonly { key: "impor" | "akun" | "profil" | "log"; label: string; short: string; ready: boolean; superOnly?: boolean }[] = [
  { key: "impor", short: "Impor", label: "Impor data", ready: true },
  { key: "akun", short: "Akun", label: "Kelola akun", ready: true },
  { key: "profil", short: "Profil", label: "Profil gereja", ready: true },
  { key: "log", short: "Log", label: "Log aktivitas", ready: true, superOnly: true },
];
export type SettingsTab = "impor" | "akun" | "profil" | "log";

export default function SettingsTabs({ active, isSuper = false }: { active: SettingsTab; isSuper?: boolean }) {
  const tabs = SETTINGS_TABS.filter((t) => !t.superOnly || isSuper);
  // HP: tab dibagi rata selebar layar dengan label singkat (tanpa geser kiri-kanan). Layar lebar: label lengkap.
  return (
    <nav className="grid grid-cols-[repeat(var(--n),minmax(0,1fr))] gap-1 rounded-2xl border border-[var(--line)] bg-white p-1.5 md:flex md:gap-1.5 md:overflow-x-auto" style={{ "--n": tabs.length } as React.CSSProperties} aria-label="Menu pengaturan">
      {tabs.map((t) => {
        const on = t.key === active;
        const cls = `flex h-10 items-center justify-center whitespace-nowrap rounded-xl px-2 text-sm font-bold md:flex-none md:px-4 ${on ? "bg-[var(--primary-soft)] text-[var(--primary-ink)]" : "text-[var(--ink-2)]"}`;
        const label = <><span className="md:hidden">{t.short}</span><span className="max-md:hidden">{t.label}</span></>;
        return t.ready ? (
          <Link key={t.key} href={`/pengaturan?tab=${t.key}`} className={`${cls} ${on ? "" : "hover:bg-[var(--bg)]"}`} aria-current={on ? "page" : undefined} aria-label={t.label}>{label}</Link>
        ) : (
          <span key={t.key} className={`${cls} opacity-45`} title="Segera hadir">{label}</span>
        );
      })}
    </nav>
  );
}
