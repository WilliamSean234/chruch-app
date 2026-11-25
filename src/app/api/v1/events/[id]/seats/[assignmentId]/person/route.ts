import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
  const prev = await prisma.eventAssignment.findFirst({ where: { id: assignmentId, eventId: id, tenantId: u.tenantId }, select: { personId: true } });
  const r = await assignPerson(u, id, assignmentId, body, { mirror: body.mirror === true }); // pasangan hanya ikut bila diminta
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "assignment.set", entity: "EventAssignment", entityId: assignmentId, payload: { eventId: id, personId: body.personId, previousPersonId: prev?.personId ?? null, mirror: body.mirror === true } });
  return NextResponse.json(r);
});
