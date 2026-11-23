import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, badRequest } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { sendStaffNotice, staffNotifyInfo } from "@/lib/eventNotify";
import { isStaffAudience } from "@/lib/notifyAudience";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ audience: z.string() });

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "event.publish");
  const { id } = await params;
  return NextResponse.json(await staffNotifyInfo(u, id));
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "event.publish");
  const { id } = await params;
  const { audience } = body.parse(await req.json());
  if (!isStaffAudience(audience)) throw badRequest("Pilihan penerima tidak dikenal.");
  const r = await sendStaffNotice(u, id, audience);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "event.notify", entity: "Event", entityId: id, payload: { audience, ...r } });
  return NextResponse.json(r);
});
