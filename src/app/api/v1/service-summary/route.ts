import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { serviceSummary } from "@/lib/serviceSummary";

const query = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  teamTypeId: z.string().uuid().optional(),
});

/** Rekap jumlah pelayanan per orang dalam sebulan. Isinya menyesuaikan role (semua / tim sendiri / diri sendiri). */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "calendar.read");
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await serviceSummary(u, q));
});
