import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pruneNotificationLog, remindAttendance, remindNewViolations, remindTomorrowMeetings, remindTomorrowStaff, safely } from "@/lib/notifyJobs";
import { cronGuard } from "../auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cron harian (sekitar 17.00 WIB): pengingat H-1, kehadiran belum diisi, dan pelanggaran aturan baru; lalu membersihkan catatan notifikasi lama. */
export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const tenants = await prisma.tenant.findMany({ where: { deletedAt: null }, select: { id: true } });
  const out: Record<string, unknown> = {};
  for (const t of tenants) {
    out[t.id] = {
      pelayanH1: await safely("pelayanH1", () => remindTomorrowStaff(t.id)),
      rapatH1: await safely("rapatH1", () => remindTomorrowMeetings(t.id)),
      kehadiran: await safely("kehadiran", () => remindAttendance(t.id)),
      aturan: await safely("aturan", () => remindNewViolations(t.id)),
      bersihLog: await safely("bersihLog", () => pruneNotificationLog(t.id)),
    };
  }
  return NextResponse.json({ ok: true, hasil: out });
}
