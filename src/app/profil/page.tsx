import Link from "next/link";
import AppShell, { currentUser, visibleNav } from "@/components/AppShell";
import { LiveNavBadge } from "@/components/ui/LiveBadges";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isSuperadmin } from "@/lib/rbac";
import { getChurchProfile } from "@/lib/church";
import { initials, ROLE_LABEL } from "@/lib/ui";
import InstallApp from "@/components/ui/InstallApp";

export default async function ProfilPage() {
  const u = await currentUser();
  const [nav, person, church, session] = await Promise.all([
    visibleNav(u),
    u.personId ? prisma.person.findUnique({ where: { id: u.personId }, select: { name: true } }) : null,
    getChurchProfile(u.tenantId).catch(() => null),
    auth(),
  ]);
  const email = session?.user?.email ?? "";
  const name = person?.name ?? (email.split("@")[0] || "Pengguna");
  const roleText = isSuperadmin(u) ? ROLE_LABEL.SUPERADMIN : [...new Set(u.roles.map((r) => ROLE_LABEL[r.code] ?? r.code))].join(", ") || "Anggota";
  // Menu yang tidak muat di tab bawah (HP) ada di sini.
  const more = nav.filter((n) => !["saya", "kalender", "rapat"].includes(n.key));

  return (
    <AppShell active="profil" title="Profil" subtitle={church?.name ?? "Akun saya"}>
      <section className="flex items-center gap-4 rounded-[20px] border border-[var(--line)] bg-white p-5">
        <span className="grid size-14 flex-none place-items-center rounded-full bg-[var(--primary)] text-lg font-extrabold text-white" aria-hidden="true">{initials(name)}</span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-lg font-extrabold">{name}</span>
          <span className="text-sm font-semibold text-[var(--ink-2)]">{roleText}</span>
          {email && <span className="truncate text-[13px] font-medium text-[var(--ink-2)]">{email}</span>}
        </div>
      </section>

      {more.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5"><span className="text-xs font-extrabold tracking-[0.07em] text-[#8A6119]">MENU LAINNYA</span><span className="h-px flex-1 bg-[#E8E4D6]" /></div>
          <div className="overflow-hidden rounded-[20px] border border-[var(--line)] bg-white">
            {more.map((n) => (
              <Link key={n.key} href={n.href} className="flex h-14 items-center gap-3.5 border-b border-[var(--line-2)] px-4 text-[15px] font-bold last:border-b-0 hover:bg-[var(--bg)]">
                <span className="text-[var(--primary-ink)]">{n.icon}</span>{n.label}<span className="ml-auto flex items-center gap-2"><LiveNavBadge badgeKey={n.badgeKey} initial={n.badge} /><span className="text-[var(--ink-2)]" aria-hidden="true">›</span></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <InstallApp />

      <section className="flex flex-col gap-3">
        {isSuperadmin(u) && <Link href="/profil/keamanan" className="flex h-12 items-center justify-center rounded-xl border border-[#D0D3E8] bg-white text-sm font-bold text-[var(--primary-ink)] hover:bg-[#f3f4f9]">Keamanan akun (verifikasi 2 langkah)</Link>}
        <Link href="/ganti-password" className="flex h-12 items-center justify-center rounded-xl border border-[#D0D3E8] bg-white text-sm font-bold text-[var(--primary-ink)] hover:bg-[#f3f4f9]">Ganti kata sandi</Link>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button type="submit" className="h-12 w-full rounded-xl border border-[#F2C9C9] bg-white text-sm font-bold text-[#9B1C1C] hover:bg-[#FFF5F5]">Keluar</button>
        </form>
      </section>
    </AppShell>
  );
}
