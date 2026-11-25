import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { leaveGroup } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string }> };

/** Anggota keluar sendiri dari kelompoknya. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  await leaveGroup(u, (await params).id);
  return new NextResponse(null, { status: 204 });
});
