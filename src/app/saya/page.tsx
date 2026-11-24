import AppShell, { currentUser } from "@/components/AppShell";
import MySchedule, { type ScheduleRow } from "@/components/saya/MySchedule";
import { mySchedule } from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { dayLong, MONTHS_AHEAD, MONTHS_BACK, ymd } from "@/lib/ui";

export default async function SayaPage() {
  const u = await currentUser();
  requirePermission(u, "schedule.read-own");
  const now = new Date();
  // Memuat beberapa bulan ke belakang dan ke depan supaya pilihan "Bulan" bisa menampilkan jadwal bulan mana pun di rentang itu.
  const cur = ymd(now);
  const y = Number(cur.slice(0, 4)), m = Number(cur.slice(5, 7)) - 1;
  const from = new Date(Date.UTC(y, m - MONTHS_BACK, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + MONTHS_AHEAD + 1, 0)).toISOString().slice(0, 10);
  const r = await mySchedule(u, { from, to });
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
      <MySchedule rows={rows} note={note} nowIso={now.toISOString()} myPersonId={u.personId} />
    </AppShell>
  );
}
