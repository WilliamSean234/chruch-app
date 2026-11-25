import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { forbidden } from "@/lib/errors";
import { createMinistry, ministryBody, ministryCreateTeamIds } from "@/lib/teams";
import { audit } from "@/lib/audit";

export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  const body = ministryBody.parse(await req.json());
  // Superadmin untuk semua tim; Admin Tim EBM hanya menambah pelayanan baru di tim EBM miliknya.
  if (!(await ministryCreateTeamIds(u)).includes(body.teamTypeId)) throw forbidden("Pelayanan baru hanya bisa ditambah oleh Superadmin, atau Admin Tim EBM untuk tim EBM-nya.");
  const row = await createMinistry(u.tenantId, body);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "ministry.create", entity: "Ministry", entityId: row.id, payload: { name: row.name } });
  return NextResponse.json(row, { status: 201 });
});
