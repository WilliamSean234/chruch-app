import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { conflict } from "./errors";

/**
 * Cegah aksi ganda (klik dua kali, retry jaringan di HP).
 * Klien mengirim header `Idempotency-Key`. Request pertama dijalankan dan hasilnya disimpan;
 * request ulang dengan key sama mengembalikan hasil yang sama tanpa menjalankan ulang.
 */
export async function withIdempotency<T extends Prisma.InputJsonValue>(
  req: Request,
  tenantId: string,
  route: string,
  run: () => Promise<T>,
): Promise<T> {
  const key = req.headers.get("idempotency-key");
  if (!key) return run();

  try {
    await prisma.idempotencyKey.create({ data: { tenantId, key, route } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const existing = await prisma.idempotencyKey.findUnique({ where: { tenantId_key: { tenantId, key } } });
      if (existing?.response != null) return existing.response as T;
      throw conflict("Permintaan yang sama sedang diproses. Coba lagi sebentar.");
    }
    throw e;
  }

  try {
    const result = await run();
    await prisma.idempotencyKey.update({ where: { tenantId_key: { tenantId, key } }, data: { response: result } });
    return result;
  } catch (e) {
    // gagal: lepaskan key supaya klien boleh mencoba lagi
    await prisma.idempotencyKey.delete({ where: { tenantId_key: { tenantId, key } } }).catch(() => {});
    throw e;
  }
}
