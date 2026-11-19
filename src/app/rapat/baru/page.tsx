import AppShell, { currentUser } from "@/components/AppShell";
import MeetingForm from "@/components/meetings/MeetingForm";
import { schedulableGroups } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";

export default async function RapatBaruPage() {
  const u = await currentUser();
  const [groups, rooms] = await Promise.all([
    schedulableGroups(u),
    prisma.room.findMany({ where: { tenantId: u.tenantId, deletedAt: null, isActive: true }, orderBy: [{ floor: { sort: "asc", nulls: "last" } }, { name: "asc" }], select: { id: true, name: true, floor: true } }),
  ]);
  return (
    <AppShell active="rapat" title="Buat rapat" subtitle="Jadwal rapat kelompok dan peminjaman ruangan">
      <MeetingForm groups={groups} rooms={rooms} />
    </AppShell>
  );
}
