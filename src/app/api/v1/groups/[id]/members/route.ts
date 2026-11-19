import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { addMember, memberBody } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const m = await addMember(u, (await params).id, memberBody.parse(await req.json()));
  return NextResponse.json({ id: m.id }, { status: 201 });
});
