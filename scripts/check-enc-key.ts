/**
 * Memeriksa apakah kunci di MINUTES_ENC_KEY cocok dengan data terenkripsi di database: npm run db:check-key
 * Hanya membaca; tidak mengubah apa pun dan tidak menampilkan isi data maupun kunci.
 * Hasil "gagal" > 0 berarti data itu dienkripsi dengan kunci lain (atau rusak).
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { decryptText, isEncrypted, normalizeKey } from "../src/lib/fieldCrypto";

const prisma = new PrismaClient();
const tally = new Map<string, { ok: number; fail: number }>();
function check(label: string, v: string | null, scope: string, field: string) {
  if (!v || !isEncrypted(v)) return;
  const t = tally.get(label) ?? { ok: 0, fail: 0 };
  try { decryptText(v, scope, field); t.ok++; } catch { t.fail++; }
  tally.set(label, t);
}

async function main() {
  const raw = process.env.MINUTES_ENC_KEY;
  if (!raw) throw new Error("MINUTES_ENC_KEY belum diisi di terminal ini.");
  const fp = createHash("sha256").update(normalizeKey(raw)).digest("hex").slice(0, 8);
  console.log(`Sidik jari kunci ini: ${fp} (samakan dengan kunci yang dipakai saat data dienkripsi; bukan kuncinya)`);

  for (const m of await prisma.meetingMinutes.findMany()) {
    for (const f of ["agenda", "discussion", "decisions"] as const) check("notulen", m[f], `minutes:${m.eventId}`, f);
    check("notulen", m.reviseReason, `minutes:${m.eventId}`, "reason");
  }
  for (const r of await prisma.meetingMinutesRevision.findMany({ include: { minutes: { select: { eventId: true } } } })) {
    for (const f of ["agenda", "discussion", "decisions"] as const) check("riwayat notulen", r[f], `minutes:${r.minutes.eventId}`, f);
    check("riwayat notulen", r.reason, `minutes:${r.minutes.eventId}`, "reason");
  }
  for (const e of await prisma.event.findMany({ where: { kind: "RAPAT" }, select: { id: true, title: true, cancelReason: true } })) {
    check("judul rapat", e.title, `meeting:${e.id}`, "title");
    check("alasan batal", e.cancelReason, `meeting:${e.id}`, "cancelReason");
  }
  for (const l of await prisma.meetingLink.findMany({ select: { eventId: true, title: true, url: true } })) {
    check("tautan", l.title, `meeting:${l.eventId}`, "link.title");
    check("tautan", l.url, `meeting:${l.eventId}`, "link.url");
  }
  for (const p of await prisma.meetingParticipant.findMany({ select: { eventId: true, guestName: true, note: true } })) {
    check("tamu dan catatan", p.guestName, `meeting:${p.eventId}`, "guestName");
    check("tamu dan catatan", p.note, `meeting:${p.eventId}`, "note");
  }
  let bad = 0;
  for (const [label, t] of tally) { console.log(`${label}: ${t.ok} terbuka, ${t.fail} gagal`); bad += t.fail; }
  if (!tally.size) console.log("Belum ada data terenkripsi.");
  console.log(bad ? "=> Ada data yang tidak terbuka dengan kunci ini." : "=> Semua data terenkripsi terbuka dengan kunci ini.");
  if (bad) process.exitCode = 2;
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
