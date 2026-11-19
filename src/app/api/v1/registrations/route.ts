import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { listRegistrations, registrationQuery } from "@/lib/registrations";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  const q = registrationQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await listRegistrations(u, q));
});
