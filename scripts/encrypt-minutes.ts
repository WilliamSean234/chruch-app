/**
 * Enkripsi seluruh isi rapat yang sudah terlanjur tersimpan sebagai teks biasa: npm run db:encrypt-minutes
 * Mencakup notulen, judul/topik rapat, alasan batal, tautan, nama tamu, catatan kehadiran; sekaligus menghapus isi rapat
 * yang tertinggal di log audit dan log notifikasi lama. Aman dijalankan berulang (yang sudah terenkripsi dilewati).
 * Butuh DATABASE_URL dan MINUTES_ENC_KEY (base64, 32 byte).
 */
import { PrismaClient } from "@prisma/client";
import { ensureEncrypted, isEncrypted } from "../src/lib/fieldCrypto";
import { Prisma } from "@prisma/client";

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
  console.log(`Notulen: ${fields} isian di ${rows} baris dienkripsi.`);

  // ── isi rapat lain ──
  const seal = (v: string | null, scope: string, field: string) => (v && !isEncrypted(v) ? ensureEncrypted(v, scope, field) : null);
  let mRows = 0;
  for (const e of await prisma.event.findMany({ where: { kind: "RAPAT" }, select: { id: true, title: true, cancelReason: true } })) {
    const sc = `meeting:${e.id}`;
    const data: Record<string, string> = {};
    const t = seal(e.title, sc, "title"); if (t) data.title = t;
    const c = seal(e.cancelReason, sc, "cancelReason"); if (c) data.cancelReason = c;
    if (Object.keys(data).length) { await prisma.event.update({ where: { id: e.id }, data }); mRows++; }
  }
  for (const l of await prisma.meetingLink.findMany({ select: { id: true, eventId: true, title: true, url: true } })) {
    const sc = `meeting:${l.eventId}`;
    const data: Record<string, string> = {};
    const t = seal(l.title, sc, "link.title"); if (t) data.title = t;
    const u = seal(l.url, sc, "link.url"); if (u) data.url = u;
    if (Object.keys(data).length) { await prisma.meetingLink.update({ where: { id: l.id }, data }); mRows++; }
  }
  for (const p of await prisma.meetingParticipant.findMany({ select: { id: true, eventId: true, guestName: true, note: true } })) {
    const sc = `meeting:${p.eventId}`;
    const data: Record<string, string> = {};
    const g = seal(p.guestName, sc, "guestName"); if (g) data.guestName = g;
    const n = seal(p.note, sc, "note"); if (n) data.note = n;
    if (Object.keys(data).length) { await prisma.meetingParticipant.update({ where: { id: p.id }, data }); mRows++; }
  }
  console.log(`Data rapat lain: ${mRows} baris dienkripsi.`);

  // ── sisa isi rapat di log lama ──
  let logs = 0;
  for (const a of await prisma.auditLog.findMany({ where: { action: { startsWith: "meeting." } }, select: { id: true, action: true, reason: true, payload: true } })) {
    const pl = a.payload && typeof a.payload === "object" && !Array.isArray(a.payload) ? { ...(a.payload as Record<string, unknown>) } : null;
    let dirty = false;
    if (pl) for (const k of ["title", "name"]) if (k in pl) { delete pl[k]; dirty = true; }
    const clearReason = !!a.reason && (a.action === "meeting.cancel" || a.action === "meeting.minutes.revise");
    if (dirty || clearReason) {
      await prisma.auditLog.update({ where: { id: a.id }, data: { ...(dirty ? { payload: pl as Prisma.InputJsonValue } : {}), ...(clearReason ? { reason: null } : {}) } });
      logs++;
    }
  }
  const old = await prisma.notificationLog.deleteMany({ where: { kind: "KELOMPOK_H1", title: { not: "Penanda pengingat" }, createdAt: { lt: new Date(Date.now() - 36 * 3600 * 1000) } } });
  console.log(`Log lama dibersihkan: ${logs} catatan audit, ${old.count} log notifikasi rapat.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
