import { NextResponse } from "next/server";
import { diffEvent } from "@/lib/eventDiff";
import { handle, notFound } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { can, requirePermission } from "@/lib/rbac";
import { canSeeDrafts } from "@/lib/calendar";
import { attendanceBrief, eventUpdateBody, getEvent, updateEvent } from "@/lib/events";
import { audit } from "@/lib/audit";
import { attendanceWriteBlock } from "@/lib/eventStatusFlow";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "calendar.read");
  const e = await getEvent(u.tenantId, (await params).id);
  if (e.status === "DRAFT" && !canSeeDrafts(u)) throw notFound("Acara"); // draf belum untuk umum
  // jumlah kehadiran hanya untuk yang boleh mencatat atau mengatur acara
  const attendance = can(u, "attendance.write") || can(u, "event.write") ? await attendanceBrief(e.id) : null;
  // attendanceOpen: boleh mengisi/mengubah kehadiran sekarang (acara terbit + aturan tanggal)
  const attendanceOpen = e.status === "PUBLISHED" && attendanceWriteBlock(new Date(e.startsAt), !!attendance) === null;
  return NextResponse.json({ ...e, attendance, attendanceOpen });
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "event.write");
  const { id } = await params;
  const body = eventUpdateBody.parse(await req.json());
  const before = await getEvent(u.tenantId, id);
  const e = await updateEvent(u, id, body);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "event.update", entity: "Event", entityId: id, payload: { changes: diffEvent(before, e) } });
  return NextResponse.json(e);
});
