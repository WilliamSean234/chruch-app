import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { getMinutes, minutesBody, saveDraft } from "@/lib/meetingMinutes";
import { requireUnlocked } from "@/lib/notulenGuard";

type Ctx = { params: Promise<{ id: string }> };

/** Notulen: hanya anggota kelompok (yang lain mendapat 404), dan baru setelah kata sandi dimasukkan ulang (403 NOTULEN_LOCKED). */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "calendar.read");
  await requireUnlocked(u, req);
  return NextResponse.json(await getMinutes(u, (await params).id));
});

/** Simpan draf (membuat notulen bila belum ada). Notulen Final tidak bisa ditimpa. */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  await requireUnlocked(u, req);
  return NextResponse.json(await saveDraft(u, (await params).id, minutesBody.parse(await req.json())));
});
