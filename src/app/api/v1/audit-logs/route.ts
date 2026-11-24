import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { auditQuery, listAuditLogs } from "@/lib/auditLog";

/** Log aktivitas berhalaman dengan filter. Hanya Superadmin dan Pengawas (izin audit.read). */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  const q = auditQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await listAuditLogs(u, q));
});
