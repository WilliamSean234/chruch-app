/**
 * Memasukkan semua orang yang akunnya berperan Penjadwal ke kelompok "TKI" (dibuat bila belum ada).
 * Hanya menambah; anggota yang sudah ada atau sengaja dikeluarkan tidak diubah.
 * Jalankan sekali untuk data yang sudah ada: npm run db:sync-tki
 */
import { PrismaClient } from "@prisma/client";
import { syncTkiGroup } from "../src/lib/tkiGroup";

const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const t of tenants) {
    const r = await prisma.$transaction((tx) => syncTkiGroup(tx, t.id, {}));
    console.log(`${t.name}: ${r.added} orang ditambahkan ke kelompok TKI.`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
