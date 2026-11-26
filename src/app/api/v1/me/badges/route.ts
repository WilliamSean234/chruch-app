import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { badgeCounts } from "@/lib/badges";

/** Angka penanda menu (permintaan daftar dan permintaan pengganti) untuk pembaruan langsung. Ringan: dua hitungan. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  return NextResponse.json(await badgeCounts(u), { headers: { "Cache-Control": "no-store" } });
});
