import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { createMinistry, ministryBody } from "@/lib/teams";
import { audit } from "@/lib/audit";

export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "master.write");
  const row = await createMinistry(u.tenantId, ministryBody.parse(await req.json()));
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "ministry.create", entity: "Ministry", entityId: row.id, payload: { name: row.name } });
  return NextResponse.json(row, { status: 201 });
});
