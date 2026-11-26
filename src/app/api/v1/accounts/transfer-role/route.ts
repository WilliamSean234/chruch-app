import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { transferBody, transferRole } from "@/lib/roleTransfer";
import { audit } from "@/lib/audit";

/** Pindahkan satu role dari akun A ke akun B. Role Superadmin: hanya Superadmin utama dan perlu kata sandi (serta kode 2 langkah). */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  const r = await transferRole(u, transferBody.parse(await req.json()));
  await audit({
    tenantId: u.tenantId, userId: u.userId, action: "user.role.transfer", entity: "User", entityId: r.to.id,
    payload: { role: r.role, fromEmail: r.from.email, toEmail: r.to.email },
  });
  return NextResponse.json(r);
});
