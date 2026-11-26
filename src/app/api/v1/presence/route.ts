import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { onlinePersonIds } from "@/lib/presence";

/** Daftar orang yang akunnya sedang online, untuk titik hijau di halaman Orang & pelayanan. Hanya untuk yang berhak melihat daftar itu. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "person.write");
  return NextResponse.json({ personIds: await onlinePersonIds(u.tenantId) }, { headers: { "Cache-Control": "no-store" } });
});
