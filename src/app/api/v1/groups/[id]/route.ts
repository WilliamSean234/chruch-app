import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { deleteGroup, getGroup, groupPatch, updateGroup } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  return NextResponse.json(await getGroup(u, (await params).id));
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const g = await updateGroup(u, (await params).id, groupPatch.parse(await req.json()));
  return NextResponse.json({ id: g.id, name: g.name, quorumMin: g.quorumMin });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  await deleteGroup(u, (await params).id);
  return new NextResponse(null, { status: 204 });
});
