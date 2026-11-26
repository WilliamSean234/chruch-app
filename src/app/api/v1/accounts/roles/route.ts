import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { roleSummary } from "@/lib/roleTransfer";

/** Jumlah pemegang tiap role (n/x) dan daftar akun pemegangnya, untuk dialog Ubah role. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  return NextResponse.json(await roleSummary(u));
});
