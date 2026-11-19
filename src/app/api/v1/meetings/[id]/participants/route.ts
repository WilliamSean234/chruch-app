import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { addParticipants, addParticipantsBody } from "@/lib/meetings";

type Ctx = { params: Promise<{ id: string }> };

/** Tambah peserta: anggota kelompok (atau seluruh anggota) dan/atau tamu. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  return NextResponse.json(await addParticipants(u, (await params).id, addParticipantsBody.parse(await req.json())), { status: 201 });
});
