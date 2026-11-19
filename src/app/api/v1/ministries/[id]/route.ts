import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { deleteMinistry, ministryBody, updateMinistry } from "@/lib/teams";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "master.write");
  const { id } = await params;
  const row = await updateMinistry(u.tenantId, id, ministryBody.partial().parse(await req.json()));
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "ministry.update", entity: "Ministry", entityId: id });
  return NextResponse.json(row);
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "master.write");
  const { id } = await params;
  await deleteMinistry(u.tenantId, id);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "ministry.delete", entity: "Ministry", entityId: id });
  return new Response(null, { status: 204 });
});
