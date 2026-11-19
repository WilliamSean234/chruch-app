import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { addGuest, guestBody } from "@/lib/attendance";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Tamu baru: dibuat sebagai Person lalu langsung hadir. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { id } = await params;
  const r = await addGuest(u, id, guestBody.parse(await req.json()));
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "attendance.guest", entity: "Person", entityId: r.person.id, payload: { eventId: id } });
  return NextResponse.json(r, { status: 201 });
});
