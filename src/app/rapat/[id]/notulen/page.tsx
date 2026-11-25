import { notFound, redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import MeetingMinutes from "@/components/meetings/MeetingMinutes";
import { NotulenGate, NotulenLockBar } from "@/components/meetings/NotulenUnlock";
import { getMeeting } from "@/lib/meetings";
import { getMinutes } from "@/lib/meetingMinutes";
import { getChurchProfile } from "@/lib/church";
import { unlockExpiry } from "@/lib/notulenGuard";
import { ApiError } from "@/lib/errors";

type Props = { params: Promise<{ id: string }> };

/** Notulen rapat. Hanya anggota kelompok (yang lain dikembalikan ke halaman rapat), dan baru terbuka setelah kata sandi dimasukkan ulang. */
export default async function NotulenPage({ params }: Props) {
  const { id } = await params;
  const u = await currentUser();
  const notFoundTo = (e: unknown) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; };
  const m = await getMeeting(u, id).catch(notFoundTo);
  if (m.locked) redirect(`/rapat/${id}`);
  const shell = { active: "rapat" as const, title: m.displayTitle, subtitle: `Notulen · ${m.group.name} · ${m.number}` };
  // isi notulen baru dibaca (dan didekripsi) setelah kata sandi dimasukkan ulang
  const until = await unlockExpiry(u);
  if (until === null) return <AppShell {...shell}><NotulenGate backHref={`/rapat/${id}`} /></AppShell>;
  const minutes = await getMinutes(u, id).catch(notFoundTo);
  return (
    <AppShell {...shell}>
      <NotulenLockBar until={until} />
      <MeetingMinutes meeting={m} minutes={minutes} churchName={(await getChurchProfile(u.tenantId)).name} />
    </AppShell>
  );
}
