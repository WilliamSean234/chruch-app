import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { approveBody, approveRegistration } from "@/lib/registrations";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  const { id } = await params;
  return NextResponse.json(await approveRegistration(u, id, approveBody.parse(await req.json())), { status: 201 });
});
