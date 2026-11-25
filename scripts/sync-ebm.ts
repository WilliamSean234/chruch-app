/**
 * Memasukkan semua orang yang melayani di bidang EBM ke kelompok "EBM" (dibuat bila belum ada).
 * Hanya menambah; anggota yang sudah ada atau sengaja dikeluarkan tidak diubah.
 * Akun Admin Tim EBM sekaligus diberi jabatan "Admin Tim EBM" (akses penuh) di kelompok itu.
 * Jalankan sekali untuk data yang sudah ada: npm run db:sync-ebm
 */
import { PrismaClient } from "@prisma/client";
import { syncEbmGroup } from "../src/lib/ebmGroup";
import { syncEbmAdmins } from "../src/lib/ebmScheduler";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const t of tenants) {
    const r = await prisma.$transaction((tx) => syncEbmGroup(tx, t.id, {}));
    console.log(`${t.name}: ${r.added} orang ditambahkan ke kelompok EBM.`);
    const a = await prisma.$transaction((tx) => syncEbmAdmins(tx, t.id, {}));
    console.log(`${t.name}: ${a.granted} Admin Tim EBM diberi akses penuh di kelompok EBM.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
