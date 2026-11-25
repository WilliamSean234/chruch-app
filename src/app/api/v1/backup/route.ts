import { forbidden, handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { isSuperadmin } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { buildBackup } from "@/lib/backup";
import { LIMITS, rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Unduh cadangan data (Excel). Hanya Superadmin; setiap unduhan tercatat di log aktivitas. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  if (!isSuperadmin(u)) throw forbidden("Hanya Superadmin yang boleh mengunduh cadangan.");
  await rateLimit(`backup:${u.userId}`, LIMITS.backup);
  const out = await buildBackup(u);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "backup.download", entity: "Tenant", entityId: u.tenantId, payload: { lembar: out.sheets.length, baris: out.total } });
  return new Response(new Uint8Array(out.file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${out.name}"`,
      "Cache-Control": "no-store",
    },
  });
});
