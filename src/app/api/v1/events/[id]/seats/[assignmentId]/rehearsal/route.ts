import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { requiredBody, setSeatRequired } from "@/lib/rehearsals";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; assignmentId: string }> };

/** Wajib / tidak wajib latihan untuk satu kursi. */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "rehearsal.write");
  const { id, assignmentId } = await params;
  const b = requiredBody.parse(await req.json());
  const r = await setSeatRequired(u, id, assignmentId, b.required, b.override);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "rehearsal.required", entity: "EventAssignment", entityId: assignmentId, payload: { eventId: id, required: b.required } });
  return NextResponse.json(r);
});
