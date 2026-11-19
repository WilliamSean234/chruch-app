/** Ukur waktu tempuh ke database: npm run db:ping */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://x/x");
  console.log(`Database: ${url.host}  (cari kode wilayah di host, mis. ap-southeast-1 = Singapura, us-east-2 = Amerika)`);
  const times: number[] = [];
  for (let i = 1; i <= 8; i++) {
    const t = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    const ms = Math.round(performance.now() - t);
    times.push(ms);
    console.log(`  query ${i}: ${ms} ms${i === 1 ? "  (pertama: termasuk sambung awal / bangun dari tidur)" : ""}`);
  }
  const warm = times.slice(1);
  const avg = Math.round(warm.reduce((a, b) => a + b, 0) / warm.length);
  console.log(`\nRata-rata per query (tanpa yang pertama): ${avg} ms`);
  console.log(avg < 40 ? "Cepat." : avg < 120 ? "Cukup. Alur yang memakai ~15 query akan terasa 1-2 detik." : "Lambat: database jauh dari server. Pindahkan ke wilayah terdekat (Singapura).");
}

main().finally(() => prisma.$disconnect());
