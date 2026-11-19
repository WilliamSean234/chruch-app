import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { changeOwnPassword, passwordBody } from "@/lib/accounts";
import { audit } from "@/lib/audit";

/** Ganti kata sandi sendiri. Boleh dipanggil saat akun masih wajib ganti kata sandi. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req, { allowMustChange: true });
  const body = passwordBody.parse(await req.json());
  const id = await changeOwnPassword(u, body);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "user.password.change", entity: "User", entityId: id });
  return NextResponse.json({ ok: true });
});
