import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { addLink, linkBody } from "@/lib/meetings";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  return NextResponse.json(await addLink(u, (await params).id, linkBody.parse(await req.json())), { status: 201 });
});
