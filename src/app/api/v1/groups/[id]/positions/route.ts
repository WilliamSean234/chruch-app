import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { createPosition, positionBody } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const p = await createPosition(u, (await params).id, positionBody.parse(await req.json()));
  return NextResponse.json({ id: p.id, name: p.name }, { status: 201 });
});
