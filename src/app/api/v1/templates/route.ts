import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { createTemplate, listTemplates, templateBody } from "@/lib/templates";
import { audit } from "@/lib/audit";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "event.write");
  return NextResponse.json({ items: await listTemplates(u.tenantId) });
});

/** Mengelola template untuk Superadmin dan Penjadwal (permission template.write). */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "template.write");
  const t = await createTemplate(u.tenantId, templateBody.parse(await req.json()));
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "template.create", entity: "EventTemplate", entityId: t.id, payload: { name: t.name } });
  return NextResponse.json(t, { status: 201 });
});
