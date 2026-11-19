import AppShell, { currentUser } from "@/components/AppShell";
import MySchedule, { type ScheduleRow } from "@/components/saya/MySchedule";
import { mySchedule } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { dayLong, ymd } from "@/lib/ui";

const DAY = 86_400_000;

export default async function SayaPage() {
  const u = await currentUser();
  requirePermission(u, "schedule.read-own");
  const now = new Date();
  // 7 hari ke belakang supaya acara yang baru selesai (kehadiran masih bisa diisi) tetap terlihat.
  const r = await mySchedule(u, { from: ymd(new Date(now.getTime() - 7 * DAY)), to: ymd(new Date(now.getTime() + 90 * DAY)) });
  const person = u.personId ? await prisma.person.findUnique({ where: { id: u.personId }, select: { name: true } }) : null;
  const note = "note" in r ? (r as { note?: string }).note : undefined;

  const rows: ScheduleRow[] = [];
  for (const it of r.items) {
    rows.push({
      key: `e-${it.eventId}`, kind: "SERVICE", eventId: it.eventId, title: it.title, startsAt: it.startsAt, endsAt: it.endsAt, room: it.room,
      role: it.role, status: it.status, rehearsalRequired: it.rehearsalRequired, canAttend: it.canAttend, attendanceMode: it.attendanceMode,
    });
    for (const h of it.rehearsals) {
      rows.push({
        key: `r-${it.eventId}-${h.seq}`, kind: "REHEARSAL", eventId: it.eventId, title: `Latihan ${it.title}`, startsAt: h.startsAt, endsAt: h.endsAt, room: h.room,
        role: it.role, status: it.status, rehearsalRequired: true, canAttend: false, attendanceMode: it.attendanceMode, note: h.note ?? undefined,
      });
    }
  }
  rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const first = (person?.name ?? "").split(/\s+/)[0] || "";
  return (
    <AppShell active="saya" title={first ? `Halo, ${first}` : "Jadwal saya"} subtitle={dayLong(now)}>
      <MySchedule rows={rows} note={note} nowIso={now.toISOString()} />
    </AppShell>
  );
}
