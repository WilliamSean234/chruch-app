import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { resetTwoFactor } from "@/lib/twoFactor";

type Ctx = { params: Promise<{ id: string }> };

/** Superadmin mereset verifikasi 2 langkah akun lain (HP hilang dan kode cadangan habis). Id = id akun. */
export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  await resetTwoFactor(u, z.string().uuid().parse((await params).id));
  return new Response(null, { status: 204 });
});
