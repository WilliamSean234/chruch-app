import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { rejectBody, rejectSwap } from "@/lib/swaps";

type Ctx = { params: Promise<{ id: string }> };

/** Penjadwal atau Admin Tim tim itu menolak permintaan. Menyetujui = mengisi kursinya dengan orang lain lewat Jadwal acara. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { id } = await params;
  const body = rejectBody.parse(await req.json().catch(() => ({})));
  return NextResponse.json(await rejectSwap(u, id, body));
});
