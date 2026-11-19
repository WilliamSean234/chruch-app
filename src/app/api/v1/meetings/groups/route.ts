import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { schedulableGroups } from "@/lib/meetings";

/** Kelompok yang boleh dipilih untuk membuat rapat oleh pengguna ini. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  return NextResponse.json({ items: await schedulableGroups(u) });
});
