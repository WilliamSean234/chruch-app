import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { accountPatch, updateAccount } from "@/lib/accounts";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Ubah role, aktif/nonaktif, atau reset kata sandi satu akun (id = id akun, bukan id orang). */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  const id = z.string().uuid().parse((await params).id);
  const body = accountPatch.parse(await req.json());
  const acc = await updateAccount(u, { userId: id }, body);
  await audit({
    tenantId: u.tenantId, userId: u.userId, action: "user.update", entity: "User", entityId: acc.id,
    payload: { email: acc.email, roles: body.roleCodes ?? null, isActive: body.isActive ?? null, passwordReset: !!body.newPassword, emailFrom: acc.emailFrom, emailTo: acc.emailFrom ? acc.email : null },
  });
  return NextResponse.json(acc);
});
