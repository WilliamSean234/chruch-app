import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { deleteLookup, lookupBody, lookupKind, updateLookup } from "@/lib/lookups";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ kind: string; id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "master.write");
  const { kind: k, id } = await params;
  const kind = lookupKind(k);
  const body = lookupBody.parse(await req.json());
  const row = await updateLookup(kind, u.tenantId, id, body);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: `${kind}.update`, entity: kind, entityId: id, payload: { name: body.name } });
  return NextResponse.json(row);
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "master.write");
  const { kind: k, id } = await params;
  const kind = lookupKind(k);
  await deleteLookup(kind, u.tenantId, id);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: `${kind}.delete`, entity: kind, entityId: id });
  return new Response(null, { status: 204 });
});
