import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { addSeats, seatBody } from "@/lib/events";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "event.write");
  const { id } = await params;
  const body = seatBody.parse(await req.json());
  const e = await addSeats(u, id, body);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "event.seat.add", entity: "Event", entityId: id, payload: body });
  return NextResponse.json(e, { status: 201 });
});
