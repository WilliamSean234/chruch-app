import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { reviseBody, reviseMinutes } from "@/lib/meetingMinutes";

type Ctx = { params: Promise<{ id: string }> };

/** Buka revisi dari notulen Final: versi berikutnya berstatus draf; versi Final lama tetap tersimpan. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const body = reviseBody.parse(await req.json().catch(() => ({})));
  return NextResponse.json(await reviseMinutes(u, (await params).id, body.reason));
});
