import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { addMyDevice, removeMyDevice, subscribeBody, unsubscribeBody } from "@/lib/myNotifications";

export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  return NextResponse.json(await addMyDevice(u, subscribeBody.parse(await req.json())), { status: 201 });
});

export const DELETE = handle(async (req: Request) => {
  const u = await requireUser(req);
  return NextResponse.json(await removeMyDevice(u, unsubscribeBody.parse(await req.json()).endpoint));
});
