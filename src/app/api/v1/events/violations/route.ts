import { NextResponse } from "next/server";
import { handle, forbidden } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { listViolations, violationQuery } from "@/lib/eventViolations";

/** Acara yang menyimpang dari aturan penjadwalan (berhalaman). Hanya untuk yang boleh menjadwalkan. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  if (!can(u, "event.write") && !can(u, "assignment.write")) throw forbidden();
  const q = violationQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await listViolations(u, q));
});
