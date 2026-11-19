import { notFound, redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import MeetingForm from "@/components/meetings/MeetingForm";
import { getMeeting, schedulableGroups } from "@/lib/meetings";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { localParts } from "@/lib/time";

type Props = { params: Promise<{ id: string }> };

export default async function UbahRapatPage({ params }: Props) {
  const { id } = await params;
  const u = await currentUser();
  const m = await getMeeting(u, id).catch((e) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; });
  if (!m.viewer.canManage || m.title === null) redirect(`/rapat/${id}`);
  const [groups, rooms] = await Promise.all([
    schedulableGroups(u),
    prisma.room.findMany({ where: { tenantId: u.tenantId, deletedAt: null, isActive: true }, orderBy: [{ floor: { sort: "asc", nulls: "last" } }, { name: "asc" }], select: { id: true, name: true, floor: true } }),
  ]);
  const start = localParts(new Date(m.startsAt));
  const end = localParts(new Date(m.endsAt));
  return (
    <AppShell active="rapat" title="Ubah rapat" subtitle={`${m.group.name} · ${m.number}`}>
      <MeetingForm groups={groups.some((g) => g.id === m.group.id) ? groups : [...groups, { id: m.group.id, name: m.group.name, memberCount: 0, isMember: m.viewer.isMember }]} rooms={rooms}
        meeting={{ id: m.id, title: m.title, date: start.date, startTime: start.time, endTime: end.time, roomId: m.room.id, groupId: m.group.id, showTopic: m.showTopic, showAttendees: m.showAttendees }} />
    </AppShell>
  );
}
