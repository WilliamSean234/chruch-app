import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { suggestPersons } from "@/lib/registrations";

type Ctx = { params: Promise<{ id: string }> };

/** Orang yang belum punya akun dan namanya mirip dengan nama pendaftar. */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  const { id } = await params;
  return NextResponse.json({ items: await suggestPersons(u, id) });
});
