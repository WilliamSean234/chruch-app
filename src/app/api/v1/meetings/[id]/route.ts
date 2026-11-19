import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { getMeeting, meetingUpdateBody, updateMeeting } from "@/lib/meetings";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "calendar.read");
  return NextResponse.json(await getMeeting(u, (await params).id));
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  return NextResponse.json(await updateMeeting(u, (await params).id, meetingUpdateBody.parse(await req.json())));
});
