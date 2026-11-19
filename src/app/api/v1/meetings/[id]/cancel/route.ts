import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { cancelBody, cancelMeeting } from "@/lib/meetings";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { reason, scope } = cancelBody.parse(await req.json());
  return NextResponse.json(await cancelMeeting(u, (await params).id, reason, scope));
});
