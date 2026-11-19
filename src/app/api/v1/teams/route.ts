import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { createTeam, listTeams, teamBody } from "@/lib/teams";
import { audit } from "@/lib/audit";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  return NextResponse.json({ items: await listTeams(u.tenantId) });
});

export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "master.write");
  const row = await createTeam(u.tenantId, teamBody.parse(await req.json()));
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "team.create", entity: "TeamType", entityId: row.id, payload: { name: row.name } });
  return NextResponse.json(row, { status: 201 });
});
