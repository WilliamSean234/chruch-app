import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { sendMyTest } from "@/lib/myNotifications";
import { LIMITS, rateLimit } from "@/lib/rateLimit";

export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  await rateLimit(`pushtest:${u.userId}`, LIMITS.pushTest);
  return NextResponse.json(await sendMyTest(u));
});
