import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { cancelSwap } from "@/lib/swaps";

type Ctx = { params: Promise<{ id: string }> };

/** Pelayan membatalkan permintaannya sendiri. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { id } = await params;
  return NextResponse.json(await cancelSwap(u, id));
});
