import { NextResponse } from "next/server";
import { forbidden, handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { listLoad, loadQuery, loadWorkbook } from "@/lib/loadReport";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Statistik beban pelayan: berapa ibadah tiap orang bertugas di satu periode. Untuk yang boleh mengatur petugas;
 * Admin Tim hanya melihat timnya sendiri. Dengan `format=xlsx` hasilnya berupa berkas Excel dan unduhannya tercatat di log aktivitas.
 */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  if (!can(u, "assignment.write")) throw forbidden();
  const q = loadQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  if (q.format !== "xlsx") return NextResponse.json(await listLoad(u, q));

  await rateLimit(`loadreport:${u.userId}`, LIMITS.loadReport);
  const out = await loadWorkbook(u, q);
  await audit({
    tenantId: u.tenantId, userId: u.userId, action: "report.load.download", entity: "Tenant", entityId: u.tenantId,
    payload: { periode: q.from === q.to ? q.from : `${q.from} s.d. ${q.to}`, orang: out.count },
  });
  return new Response(new Uint8Array(out.file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${out.name}"`,
      "Cache-Control": "no-store",
    },
  });
});
