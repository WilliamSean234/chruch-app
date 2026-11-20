import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { applyBody, applyDate } from "@/lib/teamSchedule";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Simpan satu tanggal (dua ibadah). Pemanggil mengulang per tanggal supaya ada progres dan satu kegagalan tidak membatalkan yang lain. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ format: string }> }) => {
  const u = await requireUser(req);
  const { format } = await ctx.params;
  return NextResponse.json(await applyDate(u, format, applyBody.parse(await req.json())));
});
