import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { aliasBody, saveAliases } from "@/lib/teamSchedule";

export const runtime = "nodejs";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ format: string }> }) => {
  const u = await requireUser(req);
  const { format } = await ctx.params;
  return NextResponse.json(await saveAliases(u, format, aliasBody.parse(await req.json())));
});
