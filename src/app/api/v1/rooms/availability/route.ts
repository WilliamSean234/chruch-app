import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requireRoomView } from "@/lib/roomAccess";
import { roomAvailability } from "@/lib/roomUsage";
import { canSeeMeetingSchedule } from "@/lib/groups";

const query = z.object({ roomId: z.string().uuid(), date: z.string(), start: z.string(), end: z.string() });

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  await requireRoomView(u);
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await roomAvailability(u.tenantId, q, await canSeeMeetingSchedule(u)));
});
