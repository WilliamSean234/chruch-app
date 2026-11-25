/**
 * Enkripsi isi notulen yang sudah terlanjur tersimpan sebagai teks biasa: npm run db:encrypt-minutes
 * Aman dijalankan berulang (yang sudah terenkripsi dilewati). Butuh DATABASE_URL dan MINUTES_ENC_KEY (base64, 32 byte).
 */
import { PrismaClient } from "@prisma/client";
import { ensureEncrypted, isEncrypted } from "../src/lib/fieldCrypto";

const prisma = new PrismaClient();
const FIELDS = ["agenda", "discussion", "decisions"] as const;

async function main() {
  if (!process.env.MINUTES_ENC_KEY) throw new Error("MINUTES_ENC_KEY belum diisi. Buat dengan: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"");
  let rows = 0, fields = 0;

  for (const m of await prisma.meetingMinutes.findMany()) {
    const scope = `minutes:${m.eventId}`;
    const data: Record<string, string> = {};
    for (const f of FIELDS) if (m[f] && !isEncrypted(m[f])) data[f] = ensureEncrypted(m[f], scope, f);
    if (m.reviseReason && !isEncrypted(m.reviseReason)) data.reviseReason = ensureEncrypted(m.reviseReason, scope, "reason");
    if (Object.keys(data).length) { await prisma.meetingMinutes.update({ where: { id: m.id }, data: { ...data } }); rows++; fields += Object.keys(data).length; }
  }

  for (const r of await prisma.meetingMinutesRevision.findMany({ include: { minutes: { select: { eventId: true } } } })) {
    const scope = `minutes:${r.minutes.eventId}`;
    const data: Record<string, string> = {};
    for (const f of FIELDS) if (r[f] && !isEncrypted(r[f])) data[f] = ensureEncrypted(r[f], scope, f);
    if (r.reason && !isEncrypted(r.reason)) data.reason = ensureEncrypted(r.reason, scope, "reason");
    if (Object.keys(data).length) { await prisma.meetingMinutesRevision.update({ where: { id: r.id }, data }); rows++; fields += Object.keys(data).length; }
  }
  console.log(`Selesai: ${fields} isian di ${rows} baris dienkripsi.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
