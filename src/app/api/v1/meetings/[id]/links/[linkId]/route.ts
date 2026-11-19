import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { removeLink } from "@/lib/meetings";

type Ctx = { params: Promise<{ id: string; linkId: string }> };

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { id, linkId } = await params;
  await removeLink(u, id, linkId);
  return new NextResponse(null, { status: 204 });
});
