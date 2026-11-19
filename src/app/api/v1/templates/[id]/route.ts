import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { deleteTemplate, templateBody, updateTemplate } from "@/lib/templates";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "template.write");
  const { id } = await params;
  const t = await updateTemplate(u.tenantId, id, templateBody.parse(await req.json()));
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "template.update", entity: "EventTemplate", entityId: id });
  return NextResponse.json(t);
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "template.write");
  const { id } = await params;
  await deleteTemplate(u.tenantId, id);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "template.delete", entity: "EventTemplate", entityId: id });
  return new Response(null, { status: 204 });
});
