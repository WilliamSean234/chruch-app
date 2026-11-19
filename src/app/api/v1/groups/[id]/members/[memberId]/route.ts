import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { memberPatch, removeMember, setMemberPositions } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string; memberId: string }> };

/** Ganti seluruh jabatan seorang anggota (kirim daftar lengkap positionIds). */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { id, memberId } = await params;
  await setMemberPositions(u, id, memberId, memberPatch.parse(await req.json()));
  return new NextResponse(null, { status: 204 });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { id, memberId } = await params;
  await removeMember(u, id, memberId);
  return new NextResponse(null, { status: 204 });
});
