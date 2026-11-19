import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { assignBody, assignPerson } from "@/lib/assignments";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string; assignmentId: string }> };

/** Isi kursi dengan orang (personId) atau kosongkan (personId: null). */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "assignment.write");
  const { id, assignmentId } = await params;
  const body = assignBody.parse(await req.json());
  const r = await assignPerson(u, id, assignmentId, body);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "assignment.set", entity: "EventAssignment", entityId: assignmentId, payload: { eventId: id, personId: body.personId } });
  return NextResponse.json(r);
});
