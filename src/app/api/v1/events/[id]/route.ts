import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { notFound } from "@/lib/errors";
import { canSeeDrafts } from "@/lib/calendar";
import { eventUpdateBody, getEvent, updateEvent } from "@/lib/events";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "calendar.read");
  const e = await getEvent(u.tenantId, (await params).id);
  if (e.status === "DRAFT" && !canSeeDrafts(u)) throw notFound("Acara"); // draf belum untuk umum
  return NextResponse.json(e);
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "event.write");
  const { id } = await params;
  const body = eventUpdateBody.parse(await req.json());
  const e = await updateEvent(u, id, body);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "event.update", entity: "Event", entityId: id, payload: body });
  return NextResponse.json(e);
});
