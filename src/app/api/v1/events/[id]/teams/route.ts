import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { addTeam, teamBody } from "@/lib/events";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "event.write");
  const { id } = await params;
  const { teamTypeId } = teamBody.parse(await req.json());
  const e = await addTeam(u, id, teamTypeId);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "event.team.add", entity: "Event", entityId: id, payload: { teamTypeId } });
  return NextResponse.json(e, { status: 201 });
});
