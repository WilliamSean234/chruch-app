import { NextResponse } from "next/server";
import { handle, forbidden } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { eventListQuery, listEvents } from "@/lib/events";

/** Daftar acara untuk halaman Jadwal acara (berhalaman, dengan filter). Hanya untuk yang boleh menjadwalkan. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  if (!can(u, "event.write") && !can(u, "assignment.write")) throw forbidden();
  const q = eventListQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await listEvents(u.tenantId, q));
});
