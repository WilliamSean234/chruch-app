import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { remindBirthdays, safely } from "@/lib/notifyJobs";
import { cronGuard } from "../auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cron ulang tahun (sekitar 06.00 WIB): kabari semua akun siapa yang berulang tahun hari ini. */
export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const tenants = await prisma.tenant.findMany({ where: { deletedAt: null }, select: { id: true } });
  const out: Record<string, unknown> = {};
  for (const t of tenants) out[t.id] = await safely("ultah", () => remindBirthdays(t.id));
  return NextResponse.json({ ok: true, hasil: out });
}
