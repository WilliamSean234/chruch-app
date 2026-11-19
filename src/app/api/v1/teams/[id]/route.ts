import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { deleteTeam, teamBody, updateTeam } from "@/lib/teams";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "master.write");
  const { id } = await params;
  const row = await updateTeam(u.tenantId, id, teamBody.parse(await req.json()));
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "team.update", entity: "TeamType", entityId: id });
  return NextResponse.json(row);
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "master.write");
  const { id } = await params;
  await deleteTeam(u.tenantId, id);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "team.delete", entity: "TeamType", entityId: id });
  return new Response(null, { status: 204 });
});
