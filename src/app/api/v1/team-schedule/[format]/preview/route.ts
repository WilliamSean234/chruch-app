import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { readXlsx } from "@/lib/importer/xlsx";
import { previewSchedule } from "@/lib/teamSchedule";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

/** Baca file jadwal dan kembalikan pratinjau. Tidak menyimpan apa pun. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ format: string }> }) => {
  const u = await requireUser(req);
  const { format } = await ctx.params;
  const form = await req.formData();
  const file = form.get("file");
  const year = Number(form.get("year"));
  if (!(file instanceof File)) throw new ApiError(400, "BAD_REQUEST", "Pilih file Excel (.xlsx) dulu.");
  if (!/\.xlsx$/i.test(file.name)) throw new ApiError(400, "BAD_REQUEST", "Format harus .xlsx.");
  if (file.size > MAX_BYTES) throw new ApiError(400, "BAD_REQUEST", "File terlalu besar (maks 5 MB).");
  let sheets;
  try { sheets = await readXlsx(Buffer.from(await file.arrayBuffer())); } catch { throw new ApiError(400, "BAD_REQUEST", "File tidak bisa dibaca. Pastikan ini file .xlsx yang utuh."); }
  return NextResponse.json(await previewSchedule(u, format, year, sheets));
});
