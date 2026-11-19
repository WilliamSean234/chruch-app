import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { bulkAttendance, bulkAttendanceBody } from "@/lib/meetings";

type Ctx = { params: Promise<{ id: string }> };

/** Tandai semua peserta yang belum dicatat sekaligus (mis. semua hadir). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  return NextResponse.json(await bulkAttendance(u, (await params).id, bulkAttendanceBody.parse(await req.json())));
});
