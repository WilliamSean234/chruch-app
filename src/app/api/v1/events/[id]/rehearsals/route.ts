import { NextResponse } from "next/server";
import { handle, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { canSeeDrafts } from "@/lib/calendar";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { createRehearsal, listRehearsals, rehearsalBody } from "@/lib/rehearsals";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "calendar.read");
  const { id } = await params;
  const ev = await prisma.event.findFirst({ where: { id, tenantId: u.tenantId, deletedAt: null, kind: "IBADAH" }, select: { status: true } });
  if (!ev || (ev.status === "DRAFT" && !canSeeDrafts(u))) throw notFound("Acara"); // draf belum untuk umum
  return NextResponse.json(await listRehearsals(u.tenantId, id));
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "rehearsal.write");
  const { id } = await params;
  const r = await createRehearsal(u, id, rehearsalBody.parse(await req.json()));
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "rehearsal.create", entity: "RehearsalSession", entityId: r.id, payload: { eventId: id } });
  return NextResponse.json(r, { status: 201 });
});
