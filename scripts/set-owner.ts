/**
 * Menandai akun Superadmin utama (pemilik). Akun ini tidak bisa diubah, dinonaktifkan, dihapus, atau direset oleh Superadmin lain.
 *   npm run db:set-owner                       -> menampilkan siapa pemilik sekarang
 *   npm run db:set-owner -- email@contoh.com   -> simulasi: menampilkan apa yang akan berubah
 *   npm run db:set-owner -- email@contoh.com --apply
 * Hanya satu pemilik per gereja: penanda di akun lain dicabut. Akunnya harus Superadmin aktif. Perlu DATABASE_URL di terminal ini (ketik sendiri).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const email = process.argv.slice(2).find((a) => !a.startsWith("--"))?.trim().toLowerCase();

async function main() {
  const owners = await prisma.user.findMany({ where: { isOwner: true, deletedAt: null }, select: { email: true, tenantId: true } });
  console.log(owners.length ? `Superadmin utama sekarang: ${owners.map((o) => o.email).join(", ")}` : "Belum ada Superadmin utama.");
  if (!email) return;

  const u = await prisma.user.findFirst({ where: { email, deletedAt: null }, select: { id: true, tenantId: true, isActive: true, isOwner: true, roles: { select: { role: { select: { isSuperadmin: true } } } } } });
  if (!u) throw new Error(`Akun ${email} tidak ditemukan.`);
  if (!u.isActive || !u.roles.some((r) => r.role.isSuperadmin)) throw new Error(`${email} harus berupa akun Superadmin yang aktif.`);
  if (u.isOwner && owners.length === 1) { console.log("Akun ini sudah menjadi Superadmin utama. Tidak ada yang perlu diubah."); return; }
  console.log(`Akan dijadikan Superadmin utama: ${email}`);
  if (!apply) { console.log("Ini hanya simulasi. Tambahkan --apply untuk menerapkan."); return; }
  await prisma.$transaction([
    prisma.user.updateMany({ where: { tenantId: u.tenantId, isOwner: true }, data: { isOwner: false } }),
    prisma.user.update({ where: { id: u.id }, data: { isOwner: true } }),
  ]);
  console.log("Selesai.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
