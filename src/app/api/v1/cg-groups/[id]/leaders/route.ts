import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { leadersBody, setCgLeaders } from "@/lib/cgLeaders";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Atur leader sebuah CG: kirim daftar lengkap personIds (menggantikan yang lama). */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "master.write");
  const { id } = await params;
  const body = leadersBody.parse(await req.json());
  const res = await setCgLeaders(u.tenantId, id, body.personIds);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "cg.leaders", entity: "CgGroup", entityId: id, payload: { personIds: body.personIds } });
  return NextResponse.json(res);
});
