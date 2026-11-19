import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { memberClashes } from "@/lib/meetings";
import { DATE_RE, TIME_RE } from "@/lib/time";

const query = z.object({
  groupId: z.string().uuid(),
  date: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE),
  endTime: z.string().regex(TIME_RE),
  excludeEventId: z.string().uuid().optional(),
  // hanya periksa anggota tertentu (daftar id dipisah koma); kosong = seluruh anggota
  personIds: z.string().optional().transform((v) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : undefined)).pipe(z.array(z.string().uuid()).max(300).optional()),
});

/** Peringatan: anggota kelompok yang sudah bertugas di acara lain pada jam itu. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await memberClashes(u, q));
});
