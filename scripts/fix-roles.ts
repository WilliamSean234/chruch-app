/**
 * Cek dan perbaiki izin role di database yang dipakai aplikasi: npm run db:fix-roles
 * Hanya MENAMBAH izin yang kurang (tidak menghapus apa pun), aman diulang.
 * Setelah itu pengguna harus keluar lalu masuk lagi, karena izin disimpan di sesi saat login.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TENANT_ID = "00000000-0000-4000-8000-000000000001";

// Sama dengan prisma/seed.ts. Yang dicek di sini hanya izin yang ditambahkan belakangan.
const WANT: Record<string, string[]> = {
  PENJADWAL: ["person.write", "event.write", "assignment.write", "rehearsal.write", "event.publish", "attendance.write", "calendar.read", "schedule.read-own"],
  ADMIN_TIM: ["person.write", "assignment.write", "rehearsal.write", "calendar.read", "schedule.read-own"],
  ADMIN_JEMAAT: ["person.write", "person.manage", "calendar.read", "schedule.read-own"],
  PETUGAS_ABSEN: ["attendance.write", "calendar.read", "schedule.read-own"],
  PELAYAN: ["calendar.read", "schedule.read-own"],
};

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://x/x");
  console.log(`Database: ${url.host}\n`);

  const allCodes = [...new Set(Object.values(WANT).flat())];
  for (const code of allCodes) await prisma.permission.upsert({ where: { code }, update: {}, create: { code } });
  const perms = await prisma.permission.findMany({ where: { code: { in: allCodes } } });
  const permId = new Map(perms.map((p) => [p.code, p.id]));

  for (const [code, want] of Object.entries(WANT)) {
    const role = await prisma.role.findUnique({ where: { tenantId_code: { tenantId: TENANT_ID, code } }, include: { permissions: { include: { permission: true } } } });
    if (!role) { console.log(`${code}: role TIDAK ADA di database ini`); continue; }
    const have = new Set(role.permissions.map((rp) => rp.permission.code));
    const missing = want.filter((w) => !have.has(w));
    if (missing.length === 0) { console.log(`${code}: lengkap (${have.size} izin)`); continue; }
    await prisma.rolePermission.createMany({ data: missing.map((m) => ({ roleId: role.id, permissionId: permId.get(m)! })), skipDuplicates: true });
    console.log(`${code}: ditambahkan -> ${missing.join(", ")}`);
  }
  console.log("\nSelesai. Keluar lalu masuk lagi di aplikasi supaya izin baru terbaca.");
}

main().finally(() => prisma.$disconnect());
