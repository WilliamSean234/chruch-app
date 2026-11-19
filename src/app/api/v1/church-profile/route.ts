import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { churchProfileBody, getChurchProfile, updateChurchProfile } from "@/lib/church";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  return NextResponse.json(await getChurchProfile(u.tenantId));
});

export const PUT = handle(async (req: Request) => {
  const u = await requireUser(req);
  return NextResponse.json(await updateChurchProfile(u, churchProfileBody.parse(await req.json())));
});
