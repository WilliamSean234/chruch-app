import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { applyMeetingChanges, changesBody } from "@/lib/meetings";

type Ctx = { params: Promise<{ id: string }> };

/** Simpan sekaligus perubahan kehadiran, peserta, dan tautan lampiran dari halaman rapat. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  return NextResponse.json(await applyMeetingChanges(u, (await params).id, changesBody.parse(await req.json())));
});
