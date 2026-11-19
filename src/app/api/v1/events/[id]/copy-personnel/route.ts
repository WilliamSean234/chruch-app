import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { copyBody, copyPersonnel } from "@/lib/assignments";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Isi kursi kosong di acara ini dengan personel dari acara lain (mis. Ibadah Minggu 1 ke Minggu 2). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "assignment.write");
  const { id } = await params;
  const body = copyBody.parse(await req.json());
  const r = await copyPersonnel(u, id, body.sourceEventId);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "assignment.copy", entity: "Event", entityId: id, payload: { sourceEventId: body.sourceEventId, filled: r.filled, skipped: r.skipped.length } });
  return NextResponse.json(r);
});
