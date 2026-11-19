import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { teamScope } from "@/lib/rbac";

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req, { allowMustChange: true });
  return NextResponse.json({ ...u, teamScope: teamScope(u) });
});
