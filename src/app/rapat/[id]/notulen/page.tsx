import { notFound, redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import MeetingMinutes from "@/components/meetings/MeetingMinutes";
import { getMeeting } from "@/lib/meetings";
import { getMinutes } from "@/lib/meetingMinutes";
import { getChurchProfile } from "@/lib/church";
import { ApiError } from "@/lib/errors";

type Props = { params: Promise<{ id: string }> };

/** Notulen rapat. Hanya anggota kelompok; yang lain dikembalikan ke halaman rapat (yang menampilkan bagian tertutup). */
export default async function NotulenPage({ params }: Props) {
  const { id } = await params;
  const u = await currentUser();
  const notFoundTo = (e: unknown) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; };
  const m = await getMeeting(u, id).catch(notFoundTo);
  if (m.locked) redirect(`/rapat/${id}`);
  const minutes = await getMinutes(u, id).catch(notFoundTo);
  return (
    <AppShell active="rapat" title={m.displayTitle} subtitle={`Notulen · ${m.group.name} · ${m.number}`}>
      <MeetingMinutes meeting={m} minutes={minutes} churchName={(await getChurchProfile(u.tenantId)).name} />
    </AppShell>
  );
}
