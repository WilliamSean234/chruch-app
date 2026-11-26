import { prisma } from "./prisma";
import { daysAgo, RETENTION_DAYS as R } from "./retention";

/**
 * Bersih-bersih data sementara supaya penyimpanan database tidak naik tanpa batas (dipanggil dari cron harian).
 * Hanya baris yang sudah tidak dibaca aplikasi: kunci klik-ganda lama, token email lama, pendaftaran yang mati,
 * jadwal yang sudah dilepas (semua pembacaan jadwal memakai deletedAt = null), dan sisa tanda online.
 * Tidak disentuh: log aktivitas (AuditLog), acara termasuk yang dibatalkan, kehadiran, notulen.
 */
export async function pruneTransientData(tenantId: string, now = new Date()) {
  const [idempotensi, tokenEmail, pendaftaran, jadwalDilepas, permintaanPengganti, tandaOnline] = await Promise.all([
    prisma.idempotencyKey.deleteMany({ where: { tenantId, createdAt: { lt: daysAgo(now, R.idempotencyKey) } } }),
    prisma.emailToken.deleteMany({
      where: { tenantId, OR: [{ expiresAt: { lt: daysAgo(now, R.emailToken) } }, { usedAt: { lt: daysAgo(now, R.emailToken) } }] },
    }),
    prisma.registrationRequest.deleteMany({
      where: {
        tenantId,
        OR: [
          { status: "REJECTED", OR: [{ decidedAt: { lt: daysAgo(now, R.registrationRejected) } }, { decidedAt: null, createdAt: { lt: daysAgo(now, R.registrationRejected) } }] },
          { status: "PENDING", emailVerifiedAt: null, createdAt: { lt: daysAgo(now, R.registrationUnverified) } },
        ],
      },
    }),
    prisma.booking.deleteMany({ where: { tenantId, deletedAt: { lt: daysAgo(now, R.bookingReleased) } } }),
    prisma.swapRequest.deleteMany({ where: { tenantId, status: { not: "PENDING" }, createdAt: { lt: daysAgo(now, R.swapDecided) } } }),
    // sisa tanda online (tab yang mati tanpa sempat mengirim "offline"); yang dipakai aplikasi hanya yang berumur kurang dari semenit
    prisma.presence.deleteMany({ where: { tenantId, seenAt: { lt: new Date(now.getTime() - 3_600_000) } } }),
  ]);
  return { idempotensi: idempotensi.count, tokenEmail: tokenEmail.count, pendaftaran: pendaftaran.count, jadwalDilepas: jadwalDilepas.count, permintaanPengganti: permintaanPengganti.count, tandaOnline: tandaOnline.count };
}
