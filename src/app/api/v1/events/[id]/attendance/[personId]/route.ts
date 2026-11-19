import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { undoCheckIn } from "@/lib/attendance";

type Ctx = { params: Promise<{ id: string; personId: string }> };

/** Batalkan tanda hadir. */
export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { id, personId } = await params;
  return NextResponse.json(await undoCheckIn(u, id, personId));
});
