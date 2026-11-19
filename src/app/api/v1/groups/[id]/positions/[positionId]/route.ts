import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { deletePosition, positionPatch, updatePosition } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string; positionId: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { id, positionId } = await params;
  const p = await updatePosition(u, id, positionId, positionPatch.parse(await req.json()));
  return NextResponse.json({ id: p.id, name: p.name });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { id, positionId } = await params;
  await deletePosition(u, id, positionId);
  return new NextResponse(null, { status: 204 });
});
