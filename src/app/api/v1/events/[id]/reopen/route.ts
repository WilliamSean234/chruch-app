import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { reopenEvent } from "@/lib/eventStatus";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Aktifkan kembali acara yang dibatalkan (izin sama dengan membatalkan). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "event.publish");
  const { id } = await params;
  const r = await reopenEvent(u, id);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "event.reopen", entity: "Event", entityId: id });
  return NextResponse.json(r);
});
