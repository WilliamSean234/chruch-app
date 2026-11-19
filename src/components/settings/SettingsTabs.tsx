import Link from "next/link";

export const SETTINGS_TABS: readonly { key: "impor" | "akun" | "daftar" | "profil" | "log"; label: string; short: string; ready: boolean; superOnly?: boolean }[] = [
  { key: "impor", short: "Impor", label: "Impor data", ready: true },
  { key: "akun", short: "Akun", label: "Kelola akun", ready: true },
  { key: "daftar", short: "Daftar", label: "Permintaan daftar", ready: true },
  { key: "profil", short: "Profil", label: "Profil gereja", ready: true },
  { key: "log", short: "Log", label: "Log aktivitas", ready: true, superOnly: true },
];
export type SettingsTab = "impor" | "akun" | "daftar" | "profil" | "log";

export default function SettingsTabs({ active, isSuper = false, pending = 0 }: { active: SettingsTab; isSuper?: boolean; pending?: number }) {
  const tabs = SETTINGS_TABS.filter((t) => !t.superOnly || isSuper);
  // HP: tab dibagi rata selebar layar dengan label singkat (tanpa geser kiri-kanan). Layar lebar: label lengkap.
  return (
    <nav className="grid grid-cols-[repeat(var(--n),minmax(0,1fr))] gap-1 rounded-2xl border border-[var(--line)] bg-white p-1.5 md:flex md:gap-1.5 md:overflow-x-auto" style={{ "--n": tabs.length } as React.CSSProperties} aria-label="Menu pengaturan">
      {tabs.map((t) => {
        const on = t.key === active;
        const cls = `flex h-10 items-center justify-center whitespace-nowrap rounded-xl px-1 text-[13.5px] font-bold md:flex-none md:px-4 md:text-sm ${on ? "bg-[var(--primary-soft)] text-[var(--primary-ink)]" : "text-[var(--ink-2)]"}`;
        const badge = t.key === "daftar" && pending > 0 ? <span className="ml-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#B8860B] px-1 text-[11px] font-extrabold text-white max-md:ml-1" aria-label={`${pending} menunggu`}>{pending > 99 ? "99+" : pending}</span> : null;
        const label = <><span className="md:hidden">{t.short}</span><span className="max-md:hidden">{t.label}</span>{badge}</>;
        return t.ready ? (
          <Link key={t.key} href={`/pengaturan?tab=${t.key}`} className={`${cls} ${on ? "" : "hover:bg-[var(--bg)]"}`} aria-current={on ? "page" : undefined} aria-label={t.label}>{label}</Link>
        ) : (
          <span key={t.key} className={`${cls} opacity-45`} title="Segera hadir">{label}</span>
        );
      })}
    </nav>
  );
}
