import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

type Db = Prisma.TransactionClient | typeof prisma;

/** Periode YYYYMM menurut zona waktu gereja (bukan UTC), supaya acara 1 Des 00:30 WIB masuk Desember. */
export function periodOf(date: Date, tz = process.env.APP_TIMEZONE ?? "Asia/Jakarta"): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  return `${y}${m}`;
}

export const formatDocNumber = (kind: string, period: string, n: number) => `${kind}-${period}-${String(n).padStart(4, "0")}`;

/**
 * Nomor berikutnya, mis. EV-202611-0001. Naik per tenant per bulan.
 * Upsert+increment bersifat atomik; bila dua request membuat baris pertama bersamaan,
 * salah satunya kena P2002 dan kita ulangi.
 */
export async function nextDocNumber(tenantId: string, kind: string, date: Date, db: Db = prisma): Promise<string> {
  const period = periodOf(date);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await db.docSequence.upsert({
        where: { tenantId_kind_period: { tenantId, kind, period } },
        create: { tenantId, kind, period, last: 1 },
        update: { last: { increment: 1 } },
      });
      return formatDocNumber(kind, period, row.last);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && attempt < 4) continue;
      throw e;
    }
  }
  throw new Error("Gagal membuat nomor dokumen");
}
