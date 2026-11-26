/**
 * Darurat: mematikan verifikasi 2 langkah sebuah akun dari terminal, mis. bila HP dan kode cadangan hilang dan tidak ada
 * Superadmin lain yang bisa mereset lewat Pengaturan > Kelola akun, atau kunci enkripsi server berubah.
 *   npm run db:reset-2fa -- email@contoh.com            -> simulasi: hanya menampilkan akun yang akan direset
 *   npm run db:reset-2fa -- email@contoh.com --apply    -> benar-benar mereset
 * Setelah reset, akun itu masuk dengan kata sandi saja (semua sesinya dicabut), lalu bisa mengaktifkan 2 langkah lagi di Profil > Keamanan akun.
 * Tidak menampilkan kunci maupun kode apa pun. Perlu DATABASE_URL di terminal ini (ketik sendiri; jangan dibagikan).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const email = process.argv.slice(2).find((a) => !a.startsWith("--"))?.trim().toLowerCase();

async function main() {
  if (!email) throw new Error("Tulis email akunnya, mis. npm run db:reset-2fa -- admin@contoh.com");
  const u = await prisma.user.findFirst({ where: { email, deletedAt: null }, select: { id: true, email: true, isActive: true, totpEnabledAt: true, totpSecret: true, recoveryHashes: true } });
  if (!u) throw new Error(`Akun ${email} tidak ditemukan.`);
  console.log(`Akun: ${u.email} (${u.isActive ? "aktif" : "nonaktif"})`);
  console.log(`Verifikasi 2 langkah: ${u.totpEnabledAt ? `aktif sejak ${u.totpEnabledAt.toISOString()}, sisa kode cadangan ${u.recoveryHashes.length}` : u.totpSecret ? "belum selesai dipasang" : "tidak dipakai"}`);
  if (!u.totpEnabledAt && !u.totpSecret) { console.log("Tidak ada yang perlu direset."); return; }
  if (!apply) { console.log("Ini hanya simulasi. Tambahkan --apply untuk benar-benar mereset."); return; }
  await prisma.user.update({ where: { id: u.id }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryHashes: [], sessionsValidFrom: new Date() } });
  console.log("Selesai: 2 langkah direset dan semua sesi akun ini dicabut. Pemiliknya masuk dengan kata sandi saja, lalu bisa memasangnya lagi.");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
