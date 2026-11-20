import { badRequest, handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { templateWorkbook } from "@/lib/teamSchedule";

export const runtime = "nodejs";

export const GET = handle(async (req: Request, ctx: { params: Promise<{ format: string }> }) => {
  const u = await requireUser(req);
  const { format } = await ctx.params;
  const year = Number(new URL(req.url).searchParams.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Tahun tidak valid.");
  const buf = await templateWorkbook(u, format, year);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="JADWAL_${format.toUpperCase()}_${year}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});
