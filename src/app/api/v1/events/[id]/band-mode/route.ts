import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { bandModeBody, setBandMode } from "@/lib/events";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Ubah acara menjadi Band atau No Band. Izin seperti mengatur kursi (Admin Tim hanya bila mengurus tim pemusik). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "assignment.write");
  const { id } = await params;
  const { bandMode } = bandModeBody.parse(await req.json());
  const r = await setBandMode(u, id, bandMode);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "event.band-mode", entity: "Event", entityId: id, payload: { bandMode, removed: r.removed, restored: r.restored, released: r.released } });
  return NextResponse.json(r);
});
