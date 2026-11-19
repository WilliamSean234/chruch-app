import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { bulkRequiredBody, bulkSetRequired } from "@/lib/rehearsals";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Tombol massal: wajib/tidak wajib latihan untuk satu tim, satu posisi, atau seluruh acara. */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "rehearsal.write");
  const { id } = await params;
  const b = bulkRequiredBody.parse(await req.json());
  const r = await bulkSetRequired(u, id, b);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "rehearsal.required.bulk", entity: "Event", entityId: id, payload: { ...b, updated: r.updated, blocked: r.blocked.length } });
  return NextResponse.json(r);
});
