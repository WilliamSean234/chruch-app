import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { deleteRehearsal, rehearsalPatch, updateRehearsal } from "@/lib/rehearsals";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; rid: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "rehearsal.write");
  const { id, rid } = await params;
  const r = await updateRehearsal(u, id, rid, rehearsalPatch.parse(await req.json()));
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "rehearsal.update", entity: "RehearsalSession", entityId: rid });
  return NextResponse.json(r);
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "rehearsal.write");
  const { id, rid } = await params;
  const r = await deleteRehearsal(u, id, rid);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "rehearsal.delete", entity: "RehearsalSession", entityId: rid });
  return NextResponse.json(r);
});
