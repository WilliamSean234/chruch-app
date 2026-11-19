import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { attendanceBody, removeParticipant, setAttendance } from "@/lib/meetings";

type Ctx = { params: Promise<{ id: string; pid: string }> };

/** Catat kehadiran satu peserta: INVITED (belum dicatat) | PRESENT | EXCUSED | ABSENT. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { id, pid } = await params;
  return NextResponse.json(await setAttendance(u, id, pid, attendanceBody.parse(await req.json())));
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { id, pid } = await params;
  await removeParticipant(u, id, pid);
  return new NextResponse(null, { status: 204 });
});
