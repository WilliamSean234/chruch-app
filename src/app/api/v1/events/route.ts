import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { createEvent, eventCreateBody } from "@/lib/events";
import { listCalendar } from "@/lib/calendar";
import { DATE_RE } from "@/lib/time";
import { audit } from "@/lib/audit";

const query = z.object({
  from: z.string().regex(DATE_RE),
  to: z.string().regex(DATE_RE),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).optional(),
  mine: z.enum(["true", "false"]).optional(), // "Jadwal saya"
  personId: z.string().uuid().optional(), // penjadwal: filter orang tertentu
  teamTypeId: z.string().uuid().optional(), // penjadwal: filter tim tertentu
  cancelled: z.enum(["true", "false"]).optional(), // tampilkan acara batal (hanya yang berhak)
});

/** Kalender: semua orang melihat seluruh acara (yang sudah terbit); filter orang/tim hanya sesuai hak akses. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "calendar.read");
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await listCalendar(u, { ...q, mine: q.mine === "true", cancelled: q.cancelled === "true" }));
});

export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "event.write");
  const e = await createEvent(u, eventCreateBody.parse(await req.json()));
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "event.create", entity: "Event", entityId: e.id, payload: { number: e.number, title: e.title } });
  return NextResponse.json(e, { status: 201 });
});
