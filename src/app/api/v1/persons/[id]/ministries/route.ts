import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { changePersonMinistries, ministryChangeBody } from "@/lib/persons";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Tambah atau cabut pelayanan satu orang saja (selisihnya). Admin Tim dibatasi ke pelayanan di timnya; mencabut hanya pelayanan EBM. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "person.write");
  const { id } = await params;
  const body = ministryChangeBody.parse(await req.json());
  const p = await changePersonMinistries(u, id, body);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "person.ministries", entity: "Person", entityId: id, payload: { add: body.add, remove: body.remove, ...(body.ebmGroup ? { ebmGroup: body.ebmGroup } : {}) } });
  return NextResponse.json(p);
});
