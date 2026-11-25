import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { accountBody, accountPatch, createAccountForPerson, deactivateAccount, updateAccount } from "@/lib/accounts";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  const { id } = await params;
  const body = accountBody.parse(await req.json());
  const acc = await createAccountForPerson(u, id, body);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "user.create", entity: "User", entityId: acc.id, payload: { personId: id, roles: body.roleCodes } });
  return NextResponse.json(acc, { status: 201 });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  const { id } = await params;
  const userId = await deactivateAccount(u.tenantId, id);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "user.deactivate", entity: "User", entityId: userId });
  return new Response(null, { status: 204 });
});

/** Ubah role, aktif/nonaktif, atau reset kata sandi (kata sandi baru dari admin wajib diganti saat login). */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  const { id } = await params;
  const body = accountPatch.parse(await req.json());
  const acc = await updateAccount(u, id, body);
  await audit({
    tenantId: u.tenantId, userId: u.userId, action: "user.update", entity: "User", entityId: acc.id,
    payload: { personId: id, roles: body.roleCodes ?? null, isActive: body.isActive ?? null, passwordReset: !!body.newPassword },
  });
  return NextResponse.json(acc);
});
