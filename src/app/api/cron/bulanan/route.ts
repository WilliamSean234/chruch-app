import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { monthlyDigest, safely } from "@/lib/notifyJobs";
import { cronGuard } from "../auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cron bulanan (tanggal 1 pagi): ringkasan jadwal tiap orang untuk bulan itu. */
export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const tenants = await prisma.tenant.findMany({ where: { deletedAt: null }, select: { id: true } });
  const out: Record<string, unknown> = {};
  for (const t of tenants) out[t.id] = await safely("bulanan", () => monthlyDigest(t.id));
  return NextResponse.json({ ok: true, hasil: out });
}
