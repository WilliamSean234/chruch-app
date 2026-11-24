import AppShell, { currentUser } from "@/components/AppShell";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import NotificationSettings from "@/components/ui/NotificationSettings";
import EmailStatus from "@/components/ui/EmailStatus";
import { mailConfigured } from "@/lib/mailer";

export default async function NotifikasiPage() {
  const u = await currentUser();
  const [session, me] = await Promise.all([
    auth(),
    prisma.user.findUnique({ where: { id: u.userId }, select: { emailVerifiedAt: true } }),
  ]);
  const email = session?.user?.email ?? "";

  return (
    <AppShell active="notifikasi" title="Notifikasi" subtitle="Atur pemberitahuan">
      <NotificationSettings />
      {email && <EmailStatus email={email} verified={!!me?.emailVerifiedAt} mailOn={mailConfigured()} />}
    </AppShell>
  );
}
