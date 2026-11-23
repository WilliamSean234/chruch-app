import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { getMyNotifications, prefsBody, setMyNotificationPrefs } from "@/lib/myNotifications";

/** Pengaturan notifikasi akun ini: perangkat aktif, jenis yang berlaku, dan yang dimatikan. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  return NextResponse.json(await getMyNotifications(u));
});

export const PATCH = handle(async (req: Request) => {
  const u = await requireUser(req);
  return NextResponse.json(await setMyNotificationPrefs(u, prefsBody.parse(await req.json())));
});
