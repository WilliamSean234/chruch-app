import AppShell, { currentUser } from "@/components/AppShell";
import { twoFactorStatus } from "@/lib/twoFactor";
import TwoFactorPanel from "@/components/profile/TwoFactorPanel";

export const dynamic = "force-dynamic";

/** Keamanan akun: verifikasi 2 langkah (khusus Superadmin) dengan panduan langkah demi langkah. */
export default async function KeamananPage() {
  const u = await currentUser();
  const st = await twoFactorStatus(u);
  return (
    <AppShell active="profil" title="Keamanan akun" subtitle="Verifikasi 2 langkah" back={{ href: "/profil", label: "Profil" }}>
      <TwoFactorPanel initial={st} />
    </AppShell>
  );
}
