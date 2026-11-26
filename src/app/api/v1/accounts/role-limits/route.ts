import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { limitsBody, setRoleLimits } from "@/lib/roleTransfer";

/** Atur jumlah kursi per role. Hanya Superadmin utama; batas Superadmin dikunci di kode. */
export const PUT = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  return NextResponse.json(await setRoleLimits(u, limitsBody.parse(await req.json())));
});
