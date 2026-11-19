import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { cancelBody, cancelEvent } from "@/lib/eventStatus";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "event.publish");
  const { id } = await params;
  const { reason } = cancelBody.parse(await req.json());
  const e = await cancelEvent(u, id, reason);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "event.cancel", entity: "Event", entityId: id, reason });
  return NextResponse.json(e);
});
