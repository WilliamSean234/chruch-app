import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { previewSeries, seriesPreviewBody } from "@/lib/meetings";

/** Pratinjau tanggal rapat berulang dan ketersediaan ruangan di tiap tanggal. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  return NextResponse.json(await previewSeries(u, seriesPreviewBody.parse(await req.json())));
});
