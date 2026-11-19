import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { finalizeBody, finalizeMinutes } from "@/lib/meetingMinutes";

type Ctx = { params: Promise<{ id: string }> };

/** Finalkan notulen; isi terbaru boleh dikirim bersamaan supaya yang difinalkan persis yang dilihat penulis. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const body = finalizeBody.parse(await req.json().catch(() => ({})));
  return NextResponse.json(await finalizeMinutes(u, (await params).id, body.content));
});
