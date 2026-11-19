import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { setSummary, summaryBody } from "@/lib/attendance";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Catat jumlah hadir (mode jumlah saja). Boleh diulang; angka terakhir yang berlaku. */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { id } = await params;
  const b = summaryBody.parse(await req.json());
  const r = await setSummary(u, id, b);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "attendance.summary", entity: "Event", entityId: id, payload: { total: b.total } });
  return NextResponse.json(r);
});
