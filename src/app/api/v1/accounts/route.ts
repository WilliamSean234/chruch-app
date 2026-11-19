import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { isSuperadmin, requirePermission } from "@/lib/rbac";
import { accountListQuery, listAccounts } from "@/lib/accounts";

/** Daftar semua akun login. Hanya Superadmin (user.manage). */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  const q = accountListQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await listAccounts(u.tenantId, q, { withGroups: isSuperadmin(u) }));
});
