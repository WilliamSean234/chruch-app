import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Tahun yang benar-benar punya data, untuk pilihan "Tahun" di filter (tidak menampilkan tahun kosong).
 * Tahun dihitung menurut zona waktu gereja, jadi acara 31 Desember malam tidak salah masuk tahun berikutnya.
 */
const tz = () => process.env.APP_TIMEZONE ?? "Asia/Jakarta";

/** Tahun acara ibadah atau rapat (belum dihapus; rapat hanya dari kelompok yang masih ada). */
export async function eventYears(tenantId: string, kind: "IBADAH" | "RAPAT"): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ y: number }[]>(Prisma.sql`
    SELECT DISTINCT (EXTRACT(YEAR FROM ("startsAt" AT TIME ZONE ${tz()}::text)))::int AS y
    FROM "Event"
    WHERE "tenantId" = ${tenantId} AND "deletedAt" IS NULL AND "kind" = ${kind}
      ${kind === "RAPAT" ? Prisma.sql`AND "groupId" IN (SELECT "id" FROM "MeetingGroup" WHERE "deletedAt" IS NULL)` : Prisma.empty}
    ORDER BY y DESC`);
  return rows.map((r) => Number(r.y));
}

/** Tahun yang punya catatan di log aktivitas. */
export async function auditYears(tenantId: string): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ y: number }[]>(Prisma.sql`
    SELECT DISTINCT (EXTRACT(YEAR FROM (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz()}::text)))::int AS y
    FROM "AuditLog" WHERE "tenantId" = ${tenantId}
    ORDER BY y DESC`);
  return rows.map((r) => Number(r.y));
}
