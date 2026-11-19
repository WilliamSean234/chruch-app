import { notFound } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import MeetingDetail from "@/components/meetings/MeetingDetail";
import { getMeeting } from "@/lib/meetings";
import { ApiError } from "@/lib/errors";

type Props = { params: Promise<{ id: string }> };

export default async function RapatDetailPage({ params }: Props) {
  const { id } = await params;
  const u = await currentUser();
  const m = await getMeeting(u, id).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; });
  return (
    <AppShell active="rapat" title={m.displayTitle} subtitle={`${m.group.name} · ${m.number}`}>
      <MeetingDetail meeting={m} />
    </AppShell>
  );
}
