import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { createMeetingSeries, listMeetings, meetingCreateBody } from "@/lib/meetings";
import { DATE_RE } from "@/lib/time";

const query = z.object({
  from: z.string().regex(DATE_RE),
  to: z.string().regex(DATE_RE),
  groupId: z.string().uuid().optional(),
  includeCancelled: z.enum(["true", "false"]).optional(),
});

/** Daftar rapat. Semua orang melihat waktu, ruangan, dan kelompok; isi rapat hanya untuk anggota. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "calendar.read");
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json({ items: await listMeetings(u, { ...q, includeCancelled: q.includeCancelled === "true" }) });
});

/** Buat rapat: anggota berjabatan penjadwal, atau Penjadwal global atas nama kelompok. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  const m = await createMeetingSeries(u, meetingCreateBody.parse(await req.json()));
  return NextResponse.json(m, { status: 201 });
});
