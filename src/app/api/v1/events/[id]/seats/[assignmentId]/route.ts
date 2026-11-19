import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { removeSeat } from "@/lib/events";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; assignmentId: string }> };

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "event.write");
  const { id, assignmentId } = await params;
  const e = await removeSeat(u, id, assignmentId);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "event.seat.remove", entity: "Event", entityId: id, payload: { assignmentId } });
  return NextResponse.json(e);
});
