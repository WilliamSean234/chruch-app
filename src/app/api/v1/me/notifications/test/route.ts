import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { sendMyTest } from "@/lib/myNotifications";

export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  return NextResponse.json(await sendMyTest(u));
});
