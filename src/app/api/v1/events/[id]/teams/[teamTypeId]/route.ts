import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { removeTeam } from "@/lib/events";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; teamTypeId: string }> };

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "event.write");
  const { id, teamTypeId } = await params;
  const e = await removeTeam(u, id, teamTypeId);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "event.team.remove", entity: "Event", entityId: id, payload: { teamTypeId } });
  return NextResponse.json(e);
});
