import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { applyAttendance, batchBody } from "@/lib/attendance";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Simpan kehadiran per nama sekaligus: daftar yang ditandai hadir dan yang dibatalkan. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { id } = await params;
  const r = await applyAttendance(u, id, batchBody.parse(await req.json()));
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "attendance.batch", entity: "Event", entityId: id, payload: { added: r.added, removed: r.removed } });
  return NextResponse.json(r);
});
