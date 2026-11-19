import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { listMeetingsPaged, meetingListQuery } from "@/lib/meetings";

/** Daftar rapat berhalaman dengan filter. Isi rapat tetap disamarkan untuk yang bukan anggota kelompok. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "calendar.read");
  const q = meetingListQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await listMeetingsPaged(u, q));
});
