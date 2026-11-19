import { notFound } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import AttendanceMobile, { type AttendanceState } from "@/components/saya/AttendanceMobile";
import { getAttendance } from "@/lib/attendance";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { dayLong, hm } from "@/lib/ui";

type Ctx = { params: Promise<{ id: string }> };

/** Halaman kehadiran ibadah untuk petugas (nyaman di HP). Aturan akses ada di lib/attendance. */
export default async function HadirPage({ params }: Ctx) {
  const u = await currentUser();
  const { id } = await params;
  const ev = await prisma.event.findFirst({ where: { id, tenantId: u.tenantId, deletedAt: null, kind: "IBADAH" }, include: { room: true } });
  if (!ev) notFound();

  let initial: AttendanceState | null = null;
  let error = "";
  try {
    initial = (await getAttendance(u, id)) as AttendanceState;
  } catch (e) {
    if (e instanceof ApiError) error = e.message;
    else throw e;
  }

  return (
    <AppShell active="saya" hideTabs back={{ href: "/saya", label: "Jadwal saya" }}
      title={ev.title} subtitle={`${dayLong(ev.startsAt)} · ${hm(ev.startsAt)}–${hm(ev.endsAt)} · ${ev.room.name}`}>
      {initial ? (
        <AttendanceMobile eventId={id} initial={initial} published={ev.status === "PUBLISHED"} assigned={!!u.personId} />
      ) : (
        <p role="alert" className="rounded-xl border border-[#F2C9C9] bg-[#FFF5F5] px-4 py-3 text-sm font-semibold text-[#9B1C1C]">{error || "Kehadiran tidak bisa dibuka."}</p>
      )}
    </AppShell>
  );
}
