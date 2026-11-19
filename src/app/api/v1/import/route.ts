import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { runImport } from "@/lib/importer";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 10 * 1024 * 1024;

/** Impor data dari file Excel. Hanya Superadmin (user.manage). mode=preview memeriksa saja, mode=apply menyimpan. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "user.manage");
  const form = await req.formData();
  const file = form.get("file");
  const mode = form.get("mode") === "apply" ? "apply" : "preview";
  if (!(file instanceof File)) throw new ApiError(400, "BAD_REQUEST", "Pilih file Excel (.xlsx) dulu.");
  if (!/\.xlsx$/i.test(file.name)) throw new ApiError(400, "BAD_REQUEST", "Format harus .xlsx.");
  if (file.size > MAX_BYTES) throw new ApiError(400, "BAD_REQUEST", "File terlalu besar (maks 10 MB).");
  const result = await runImport(u, Buffer.from(await file.arrayBuffer()), mode);
  return NextResponse.json(result);
});
