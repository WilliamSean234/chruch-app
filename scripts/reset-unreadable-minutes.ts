/**
 * Menghapus notulen yang tidak bisa dibuka dengan kunci di MINUTES_ENC_KEY (isinya dienkripsi dengan kunci lain yang sudah hilang).
 *   npm run db:reset-bad-minutes            -> simulasi: hanya menampilkan apa yang akan dihapus
 *   npm run db:reset-bad-minutes -- --apply -> benar-benar menghapus
 * Yang dihapus: baris notulen yang salah satu isinya gagal dibuka (beserta riwayat versinya), dan riwayat versi yang gagal dibuka.
 * Rapat, peserta, dan tautan tidak disentuh. Penghapusan permanen: pakai hanya untuk data yang memang boleh hilang.
 * Tidak menampilkan isi data maupun kunci.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { decryptText, isEncrypted, normalizeKey } from "../src/lib/fieldCrypto";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const unreadable = (v: string | null, scope: string, field: string) => {
  if (!v || !isEncrypted(v)) return false;
  try { decryptText(v, scope, field); return false; } catch { return true; }
};

async function main() {
  const raw = process.env.MINUTES_ENC_KEY;
  if (!raw) throw new Error("MINUTES_ENC_KEY belum diisi di terminal ini.");
  const fp = createHash("sha256").update(normalizeKey(raw)).digest("hex").slice(0, 8);
  console.log(`Sidik jari kunci ini: ${fp}. Pastikan sama dengan kunci yang dipakai di Vercel (Production).`);

  const badMinutes: { id: string; eventId: string; version: number }[] = [];
  for (const m of await prisma.meetingMinutes.findMany()) {
    const s = `minutes:${m.eventId}`;
    if (unreadable(m.agenda, s, "agenda") || unreadable(m.discussion, s, "discussion") || unreadable(m.decisions, s, "decisions") || unreadable(m.reviseReason, s, "reason"))
      badMinutes.push({ id: m.id, eventId: m.eventId, version: m.version });
  }
  const badIds = new Set(badMinutes.map((m) => m.id));
  const badRevisions: string[] = [];
  for (const r of await prisma.meetingMinutesRevision.findMany({ include: { minutes: { select: { eventId: true } } } })) {
    if (badIds.has(r.minutesId)) continue; // ikut terhapus bersama notulennya
    const s = `minutes:${r.minutes.eventId}`;
    if (unreadable(r.agenda, s, "agenda") || unreadable(r.discussion, s, "discussion") || unreadable(r.decisions, s, "decisions") || unreadable(r.reason, s, "reason")) badRevisions.push(r.id);
  }

  console.log(`Notulen yang tidak terbuka: ${badMinutes.length} (rapat: ${badMinutes.map((m) => m.eventId.slice(0, 8)).join(", ") || "-"})`);
  console.log(`Riwayat versi lain yang tidak terbuka: ${badRevisions.length}`);
  if (!badMinutes.length && !badRevisions.length) { console.log("=> Tidak ada yang perlu dihapus."); return; }
  if (!apply) { console.log("=> SIMULASI, belum ada yang dihapus. Jalankan lagi dengan: npm run db:reset-bad-minutes -- --apply"); return; }

  const [a, b] = await prisma.$transaction([
    prisma.meetingMinutesRevision.deleteMany({ where: { id: { in: badRevisions } } }),
    prisma.meetingMinutes.deleteMany({ where: { id: { in: [...badIds] } } }), // riwayat milik notulen ini ikut terhapus (cascade)
  ]);
  console.log(`=> Selesai: ${b.count} notulen dan ${a.count} riwayat lain dihapus. Rapatnya tetap ada; notulennya bisa ditulis ulang.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
