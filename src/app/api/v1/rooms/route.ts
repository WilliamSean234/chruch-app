import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requireRoomView } from "@/lib/roomAccess";
import { listRooms, roomListQuery } from "@/lib/rooms";

/** Daftar ruangan berhalaman (cari, lantai, status). Penjadwal boleh melihat; mengubah lewat /lookups/rooms. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  await requireRoomView(u);
  const q = roomListQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await listRooms(u.tenantId, q));
});
