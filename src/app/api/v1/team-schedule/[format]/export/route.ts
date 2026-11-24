import { NextResponse } from "next/server";
import { badRequest, handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { exportCombined, exportSchedule, exportWorkbook } from "@/lib/teamSchedule";
import { COMBINED_FORMAT } from "@/lib/scheduleMerge";

export const runtime = "nodejs";

/** Data jadwal untuk dibagikan: ?year=2027&months=1,2,3 (kosong = setahun penuh). Format "gabungan": ?teams=ebm,usher (kosong = semua tim). */
export const GET = handle(async (req: Request, ctx: { params: Promise<{ format: string }> }) => {
  const u = await requireUser(req);
  const { format } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const year = Number(q.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Tahun tidak valid.");
  const raw = q.get("months");
  const months = raw ? raw.split(",").map(Number) : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const teams = (q.get("teams") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const model = format === COMBINED_FORMAT ? await exportCombined(u, teams, year, months) : await exportSchedule(u, format, year, months);
  if (q.get("as") === "xlsx") {
    return new Response(new Uint8Array(exportWorkbook(model)), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="JADWAL_${format.toUpperCase()}_${year}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }
  return NextResponse.json(model);
});
