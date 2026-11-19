import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { mySchedule } from "@/lib/calendar";
import { DATE_RE } from "@/lib/time";

const query = z.object({ from: z.string().regex(DATE_RE).optional(), to: z.string().regex(DATE_RE).optional() });

/** "Jadwal saya": tugas dan latihan wajib. Tanpa from/to = 90 hari ke depan. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "schedule.read-own");
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await mySchedule(u, q));
});
