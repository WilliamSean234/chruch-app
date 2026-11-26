import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requireRoomView } from "@/lib/roomAccess";
import { roomUsage } from "@/lib/roomUsage";
import { canSeeDrafts } from "@/lib/calendar";
import { meetingViewer } from "@/lib/meetings";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  await requireRoomView(u);
  const date = new URL(req.url).searchParams.get("date") ?? "";
  return NextResponse.json(await roomUsage(u.tenantId, date, canSeeDrafts(u), (await meetingViewer(u)).canSee));
});
