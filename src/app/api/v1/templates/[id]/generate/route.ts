import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { generateBody, generateFromTemplate } from "@/lib/templates";
import { withIdempotency } from "@/lib/idempotency";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "event.write");
  const { id } = await params;
  const body = generateBody.parse(await req.json());
  const result = await withIdempotency(req, u.tenantId, `template.generate:${id}`, async () => {
    const r = await generateFromTemplate(u, id, body);
    await audit({ tenantId: u.tenantId, userId: u.userId, action: "template.generate", entity: "EventTemplate", entityId: id, payload: { ...body, created: r.created.length, skipped: r.skipped.length } });
    return r;
  });
  return NextResponse.json(result, { status: 201 });
});
