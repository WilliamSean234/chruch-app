import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { suggestForSeat } from "@/lib/assignments";

type Ctx = { params: Promise<{ id: string; assignmentId: string }> };

const query = z.object({ search: z.string().optional(), includeOthers: z.enum(["true", "false"]).default("false") });

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "assignment.write");
  const { id, assignmentId } = await params;
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await suggestForSeat(u, id, assignmentId, { search: q.search, includeOthers: q.includeOthers === "true" }));
});
