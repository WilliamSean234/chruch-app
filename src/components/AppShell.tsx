import { badgeCounts } from "@/lib/badges";
import { BadgeLive, LiveNavBadge, LiveNavDot } from "@/components/ui/LiveBadges";
import Link from "next/link";
import { getChurchProfile } from "@/lib/church";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { liveUser } from "@/lib/liveUser";
import { can, isSuperadmin, type AuthUser } from "@/lib/rbac";
import { canScheduleInAnyGroup, isInAnyGroup } from "@/lib/groups";
import { initials, ROLE_LABEL } from "@/lib/ui";
import BrandMark from "@/components/ui/BrandMark";

export type NavKey = "saya" | "profil" | "kalender" | "jadwal" | "rapat" | "kelompok" | "template" | "orang" | "ruangan" | "notifikasi" | "log" | "pengaturan";

const icon = (d: React.ReactNode) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONS: Record<NavKey, React.ReactNode> = {
  saya: icon(<><path d="M5 21V8a7 7 0 0114 0v13" /><path d="M12 11v6M9 14h6" /></>),
  profil: icon(<><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" /></>),
  kalender: icon(<><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>),
  jadwal: icon(<><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>),
  rapat: icon(<><path d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1z" /><path d="M6 6h12a1 1 0 011 1v13a1 1 0 01-1 1H6a1 1 0 01-1-1V7a1 1 0 011-1z" /><path d="M9 12h6M9 16h4" /></>),
  kelompok: icon(<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />),
  template: icon(<><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>),
  orang: icon(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.8a3.4 3.4 0 010 6.4M18 14.8c2 .6 3.2 2.3 3.5 5.2" /></>),
  ruangan: icon(<><path d="M5 21V8a7 7 0 0114 0v13" /><path d="M3 21h18M9 21v-6a3 3 0 016 0v6" /></>),
  notifikasi: icon(<><path d="M6 17V11a6 6 0 0112 0v6l1.5 2h-15L6 17z" /><path d="M10 21a2 2 0 004 0" /></>),
  log: icon(<><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4M10 12h6M10 16h6" /></>),
  pengaturan: icon(<><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></>),
};

/** Menu; `ready: false` = halamannya belum dibuat, tampil redup. */
const NAV: { key: NavKey; label: string; href: string; ready: boolean; show: (u: AuthUser, inGroup: boolean, scheduler: boolean) => boolean }[] = [
  { key: "saya", label: "Jadwal saya", href: "/saya", ready: true, show: (u) => can(u, "schedule.read-own") && !!u.personId },
  { key: "kalender", label: "Kalender", href: "/", ready: true, show: (u) => can(u, "calendar.read") },
  { key: "jadwal", label: "Jadwal acara", href: "/jadwal", ready: true, show: (u) => can(u, "event.write") || can(u, "assignment.write") },
  { key: "rapat", label: "Rapat", href: "/rapat", ready: true, show: (u, g) => isSuperadmin(u) || can(u, "event.write") || g },
  { key: "kelompok", label: "Kelompok", href: "/kelompok", ready: true, show: (u, g) => isSuperadmin(u) || g },
  { key: "template", label: "Template acara", href: "/template", ready: true, show: (u) => can(u, "template.write") },
  { key: "orang", label: "Orang & pelayanan", href: "/orang", ready: true, show: (u) => can(u, "person.write") },
  { key: "ruangan", label: "Ruangan", href: "/ruangan", ready: true, show: () => true }, // semua orang boleh melihat ruangan; mengubah tetap dibatasi
  { key: "notifikasi", label: "Notifikasi", href: "/notifikasi", ready: true, show: () => true },
  // Pengawas: hanya membaca log. Superadmin membukanya lewat tab Log di Pengaturan.
  { key: "log", label: "Log aktivitas", href: "/log", ready: true, show: (u) => can(u, "audit.read") && !can(u, "user.manage") },
  { key: "pengaturan", label: "Pengaturan", href: "/pengaturan", ready: true, show: (u) => can(u, "user.manage") },
];

export async function currentUser(): Promise<AuthUser> {
  const s = await auth();
  const c = s?.user;
  if (!c?.userId || !c.tenantId) redirect("/login");
  // izin dan status akun dibaca ulang dari database: akun nonaktif atau sesi yang sudah dicabut kembali ke halaman masuk
  const u = await liveUser({ userId: c.userId, tenantId: c.tenantId, personId: c.personId ?? null, roles: c.roles, permissions: c.permissions, authAt: c.authAt });
  if (!u) redirect("/login");
  if (u.mustChangePassword) redirect("/ganti-password");
  return { userId: u.userId, tenantId: u.tenantId, personId: u.personId, roles: u.roles, permissions: u.permissions };
}


/** Menu yang boleh dilihat pengguna ini (dipakai juga oleh halaman Profil di HP). */
export async function visibleNav(user: AuthUser) {
  const inGroup = isSuperadmin(user) ? true : await isInAnyGroup(user);
  const scheduler = can(user, "event.write") || can(user, "master.write") ? true : await canScheduleInAnyGroup(user);
  const items = NAV.filter((n) => n.show(user, inGroup, scheduler));
  // Penanda angka: Pengaturan = permintaan daftar akun yang menunggu; Jadwal acara = permintaan pengganti dari pelayan yang menunggu.
  const counts = await badgeCounts(user);
  return items.map((n) => ({
    key: n.key, label: n.label, href: n.href, ready: n.ready, icon: ICONS[n.key],
    badge: n.key === "pengaturan" ? counts.pengaturan : n.key === "jadwal" ? counts.jadwal : 0,
    badgeKey: n.key === "pengaturan" ? ("pengaturan" as const) : n.key === "jadwal" ? ("jadwal" as const) : null,
  }));
}

/** Tab bawah di HP: hanya yang paling sering dipakai; sisanya ada di halaman Profil. */
const TAB_KEYS: NavKey[] = ["saya", "kalender", "rapat"];

export default async function AppShell({ active, title, subtitle, actions, back, hideTabs, children }: {
  active: NavKey; title: string; subtitle?: string; actions?: React.ReactNode;
  /** Tautan kembali kecil di atas judul (halaman anak, mis. kehadiran). */
  back?: { href: string; label: string };
  /** Sembunyikan tab bawah di HP (halaman yang punya bilah simpan sendiri). */
  hideTabs?: boolean;
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const nav = await visibleNav(user);
  const initialBadges = { pengaturan: nav.find((n) => n.key === "pengaturan")?.badge ?? 0, jadwal: nav.find((n) => n.key === "jadwal")?.badge ?? 0 };
  const watchBadges = { pengaturan: nav.some((n) => n.key === "pengaturan"), jadwal: nav.some((n) => n.key === "jadwal") && can(user, "assignment.write") }; // hanya yang bisa menerima permintaan yang memantau
  const person = user.personId ? await prisma.person.findUnique({ where: { id: user.personId }, select: { name: true } }) : null;
  const church = await getChurchProfile(user.tenantId).catch(() => null);
  const email = (await auth())?.user?.email ?? "";
  const name = person?.name ?? (email.split("@")[0] || "Pengguna");
  const roleText = isSuperadmin(user) ? ROLE_LABEL.SUPERADMIN : [...new Set(user.roles.map((r) => ROLE_LABEL[r.code] ?? r.code))].join(", ") || "Anggota";
  // Superadmin yang belum memakai verifikasi 2 langkah diingatkan di setiap halaman (kecuali halaman pengaturannya sendiri).
  const needs2fa = isSuperadmin(user) && title !== "Keamanan akun"
    && !(await prisma.user.findUnique({ where: { id: user.userId }, select: { totpEnabledAt: true } }).then((r) => !!r?.totpEnabledAt).catch(() => true));

  return (
    <div className="flex min-h-screen flex-wrap bg-[var(--bg)]">
      <BadgeLive initial={initialBadges} watch={watchBadges} />
      <aside className="relative hidden w-full flex-none flex-col gap-7 overflow-hidden border-r border-[var(--line)] bg-white px-[18px] pb-6 pt-7 md:sticky md:top-0 md:flex md:h-screen md:w-60 md:self-start">
        <div className="flex items-center gap-3 px-2">
          <BrandMark />
          <div className="flex flex-col leading-[1.15]">
            <span className="line-clamp-2 text-[17px] font-extrabold tracking-tight">{church?.name ?? "Pelayanan"}</span>
            <span className="text-xs font-medium text-[var(--ink-2)]">{church?.tagline ?? "Penjadwalan gereja"}</span>
          </div>
        </div>
        <nav className="relative z-10 flex flex-col gap-1" aria-label="Menu utama">
          {nav.map((n) => {
            const on = n.key === active;
            const cls = `flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] ${on ? "bg-[var(--primary-soft)] font-bold text-[var(--primary-ink)]" : "font-semibold text-[var(--ink-2)]"}`;
            return n.ready ? (
              <Link key={n.key} href={n.href} className={`${cls} ${on ? "" : "hover:bg-[#ecedf8]"}`} aria-current={on ? "page" : undefined}>{n.icon}{n.label}<LiveNavBadge badgeKey={n.badgeKey} initial={n.badge} className="ml-auto" /></Link>
            ) : (
              <span key={n.key} className={`${cls} opacity-45`} title="Segera hadir">{n.icon}{n.label}</span>
            );
          })}
        </nav>
        <svg className="pointer-events-none absolute -bottom-6 -left-[30px] opacity-90" width="300" height="230" viewBox="0 0 300 230" fill="none" aria-hidden="true">
          <path d="M40 230V120C40 66 80 30 150 30s110 36 110 90v110" stroke="#E7C27A" strokeWidth="1.4" />
          <path d="M80 230V125c0-38 28-62 70-62s70 24 70 62v105" stroke="#E7C27A" strokeWidth="1.4" opacity="0.8" />
          <path d="M118 230v-98c0-20 14-34 32-34s32 14 32 34v98" stroke="#E7C27A" strokeWidth="1.4" opacity="0.6" />
        </svg>
      </aside>

      <main className="flex min-w-0 flex-[999_1_560px] flex-col">
        <header className="z-30 flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--bg)]/95 px-5 py-3 backdrop-blur md:sticky md:top-0 md:h-[var(--header-h)] md:flex-nowrap md:px-8 md:py-0">
          <div className="flex min-w-0 flex-col gap-1">
            {back && <Link href={back.href} className="flex w-fit items-center gap-1 text-[13px] font-bold text-[var(--primary-ink)] hover:underline"><span aria-hidden="true">‹</span>{back.label}</Link>}
            <h1 className="truncate text-2xl font-extrabold leading-tight tracking-tight">{title}</h1>
            {subtitle && (
              <div className="flex items-center gap-2.5">
                <span className="h-0.5 w-6 flex-none rounded bg-[var(--gold)]" aria-hidden="true" />
                <span className="truncate text-sm font-semibold text-[var(--ink-2)]">{subtitle}</span>
              </div>
            )}
          </div>
          <div className="flex flex-none flex-wrap items-center gap-3">
            {actions}
            <div className="hidden items-center gap-2.5 rounded-full border border-[var(--line)] bg-white py-1.5 pl-1.5 pr-3.5 md:flex">
              <span className="grid size-8 place-items-center rounded-full bg-[var(--primary)] text-[13px] font-bold text-white" aria-hidden="true">{initials(name)}</span>
              <span className="flex flex-col leading-tight">
                <span className="text-[13.5px] font-bold">{name}</span>
                <span className="text-xs text-[var(--ink-2)]">{roleText}</span>
              </span>
              <Link href="/ganti-password" className="ml-1 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold text-[var(--ink-2)] hover:bg-[#ecedf8]">Ganti sandi</Link>
              {isSuperadmin(user) && <Link href="/profil/keamanan" className="whitespace-nowrap rounded-lg px-2 py-1 text-xs font-bold text-[var(--ink-2)] hover:bg-[#ecedf8]">Keamanan</Link>}
              <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
                <button className="rounded-lg rounded-lg px-2 py-1 text-xs font-bold text-[var(--ink-2)] hover:bg-[#ecedf8]" type="submit">Keluar</button>
              </form>
            </div>
          </div>
        </header>
        <div className={`flex flex-col gap-[22px] px-5 pt-5 md:px-8 md:pb-10 ${hideTabs ? "pb-6" : "pb-36"}`}>
        {needs2fa && (
          <Link href="/profil/keamanan" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-[#E7C27A] bg-[#FFFBF0] px-4 py-3 text-sm font-semibold text-[#6F4304] hover:bg-[#FFF6DD]">
            <span>Akun Superadmin Anda belum memakai verifikasi 2 langkah. Aktifkan supaya akun ini aman walau kata sandinya bocor.</span>
            <span className="whitespace-nowrap font-extrabold text-[var(--primary-ink)]">Aktifkan sekarang ›</span>
          </Link>
        )}
        {children}
        </div>
      </main>

      {!hideTabs && (
        <nav aria-label="Menu" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--line)] bg-white px-3 pb-[env(safe-area-inset-bottom)] md:hidden">
          {[...nav.filter((n) => TAB_KEYS.includes(n.key)), { key: "profil" as NavKey, label: "Profil", href: "/profil", ready: true, icon: ICONS.profil, badge: initialBadges.pengaturan + initialBadges.jadwal, badgeKey: null }].map((n) => {
            const on = n.key === active || (n.key === "profil" && !TAB_KEYS.includes(active));
            return (
              <Link key={n.key} href={n.href} aria-current={on ? "page" : undefined}
                className={`flex h-[68px] flex-1 flex-col items-center justify-center gap-1 text-[11.5px] ${on ? "font-extrabold text-[var(--primary-ink)]" : "font-bold text-[var(--ink-2)]"}`}>
                <span className="relative">{n.icon}{n.key === "profil" && <LiveNavDot keys={["pengaturan", "jadwal"]} initial={n.badge} />}</span>{n.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
