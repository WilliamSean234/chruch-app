import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { createSwap, listSwaps, swapBody } from "@/lib/swaps";

/** Permintaan pengganti yang menunggu keputusan: Penjadwal (semua tim) dan Admin Tim (timnya). */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  return NextResponse.json(await listSwaps(u));
});

/** Pelayan meminta kursinya sendiri digantikan. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "schedule.read-own");
  return NextResponse.json(await createSwap(u, swapBody.parse(await req.json())), { status: 201 });
});
