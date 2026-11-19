import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { checkIn, checkinBody, getAttendance } from "@/lib/attendance";

type Ctx = { params: Promise<{ id: string }> };

/** Keadaan kehadiran. Mode per nama: tambahkan ?search=nama untuk mencari calon peserta. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const search = new URL(req.url).searchParams.get("search") ?? undefined;
  return NextResponse.json(await getAttendance(u, (await params).id, search));
});

/** Tandai satu orang hadir (mode per nama). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const { personId } = checkinBody.parse(await req.json());
  return NextResponse.json(await checkIn(u, (await params).id, personId), { status: 201 });
});
