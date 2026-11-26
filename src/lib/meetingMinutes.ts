import { z } from "zod";
import { prisma } from "./prisma";
import { audit } from "./audit";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import type { AuthUser } from "./rbac";
import { creatorNames } from "./creators";
import { accessTo, loadMeeting } from "./meetings";
import { decryptText, encryptText, ensureEncrypted } from "./fieldCrypto";

/**
 * Notulen rapat. Aturan:
 * - Hanya anggota kelompok yang melihatnya. Superadmin dan Penjadwal global yang bukan anggota mendapat "tidak ditemukan".
 * - Menulis draf: jabatan berhak "menulis notulen" (atau "memfinalkan"). Memfinalkan dan membuat revisi: jabatan berhak "memfinalkan".
 * - Draf bebas diubah. Final terkunci; mengubahnya = revisi baru (versi berikutnya), versi Final sebelumnya diarsipkan dan tidak berubah.
 * - Selama revisi masih draf, anggota yang tidak berhak menulis tetap melihat versi Final terakhir.
 * - Tindak lanjut ditulis di dalam isi notulen (bagian pembahasan), bukan modul terpisah.
 */
const text = z.string().max(20000, "Terlalu panjang (paling banyak 20.000 huruf).");
export const minutesBody = z.object({ agenda: text, discussion: text, decisions: text });
export const finalizeBody = z.object({ content: minutesBody.optional() });
export const reviseBody = z.object({ reason: z.string().trim().max(300).optional() });

type Content = z.infer<typeof minutesBody>;

// Isi notulen tersimpan terenkripsi (lihat fieldCrypto.ts); terikat ke rapat (eventId) dan nama kolom.
const scope = (eventId: string) => `minutes:${eventId}`;
const sealContent = (eventId: string, c: Content): Content => ({
  agenda: encryptText(c.agenda, scope(eventId), "agenda"),
  discussion: encryptText(c.discussion, scope(eventId), "discussion"),
  decisions: encryptText(c.decisions, scope(eventId), "decisions"),
});
const openText = (eventId: string, v: string, field: string) => decryptText(v, scope(eventId), field);
const openOpt = (eventId: string, v: string | null, field: string) => (v ? decryptText(v, scope(eventId), field) : v);
const isEmpty = (c: Content) => !`${c.agenda}${c.discussion}${c.decisions}`.trim();

async function memberAccess(u: AuthUser, id: string) {
  const e = await loadMeeting(u, id);
  const a = await accessTo(u, e.group.id);
  if (!a.caps.isMember) throw notFound("Notulen"); // bukan anggota: seolah tidak ada
  if (!e.fullMeeting) throw conflict("Rapat ini hanya jadwal, tanpa notulen. Ubah menjadi rapat lengkap lewat Ubah jadwal.");
  const open = e.status !== "CANCELLED";
  return {
    e,
    canWrite: open && (a.caps.canWriteMinutes || a.caps.canFinalize),
    canFinalize: open && a.caps.canFinalize,
  };
}

export async function getMinutes(u: AuthUser, id: string) {
  const { e, canWrite, canFinalize } = await memberAccess(u, id);
  const raw = await prisma.meetingMinutes.findUnique({ where: { eventId: id }, include: { revisions: { orderBy: { version: "desc" } } } });
  const m = raw && {
    ...raw,
    agenda: openText(id, raw.agenda, "agenda"), discussion: openText(id, raw.discussion, "discussion"), decisions: openText(id, raw.decisions, "decisions"),
    reviseReason: openOpt(id, raw.reviseReason, "reason"),
    revisions: raw.revisions.map((r) => ({ ...r, agenda: openText(id, r.agenda, "agenda"), discussion: openText(id, r.discussion, "discussion"), decisions: openText(id, r.decisions, "decisions"), reason: openOpt(id, r.reason, "reason") })),
  };
  const names = await creatorNames([m?.draftById, m?.updatedById, m?.finalizedById, ...(m?.revisions ?? []).flatMap((r) => [r.authorId, r.finalizedById])]);
  const nm = (x: string | null | undefined) => (x ? names.get(x) ?? null : null);

  const lastFinal = m?.revisions[0] ?? null;
  const revising = !!m && m.status === "DRAFT" && m.version > 1;
  // pembaca tanpa hak menulis tetap melihat versi Final terakhir selama revisi masih draf
  const showFinal = revising && !canWrite && !!lastFinal;
  const shown = showFinal && lastFinal
    ? { agenda: lastFinal.agenda, discussion: lastFinal.discussion, decisions: lastFinal.decisions }
    : { agenda: m?.agenda ?? "", discussion: m?.discussion ?? "", decisions: m?.decisions ?? "" };

  const history: { key: string; kind: "FINAL" | "DRAFT"; version: number; title: string; by: string | null; at: string; reason: string | null }[] = [];
  if (m && m.status === "DRAFT") {
    history.push({ key: `draft-${m.version}`, kind: "DRAFT", version: m.version, title: `Versi ${m.version} · ${m.version > 1 ? "Revisi, draf dibuat" : "Draf dibuat"}`, by: nm(m.draftById), at: m.draftAt.toISOString(), reason: m.reviseReason });
  }
  for (const r of m?.revisions ?? []) {
    history.push({ key: `final-${r.version}`, kind: "FINAL", version: r.version, title: `Versi ${r.version} · Final`, by: nm(r.finalizedById), at: r.finalizedAt.toISOString(), reason: null });
    history.push({ key: `draft-${r.version}`, kind: "DRAFT", version: r.version, title: `Versi ${r.version} · ${r.version > 1 ? "Revisi, draf dibuat" : "Draf dibuat"}`, by: nm(r.authorId), at: r.draftAt.toISOString(), reason: r.reason });
  }

  return {
    exists: !!m,
    status: (m?.status ?? "NONE") as "NONE" | "DRAFT" | "FINAL",
    version: m?.version ?? 0,
    content: shown,
    revising,
    reviseReason: m?.reviseReason ?? null,
    showingFinal: showFinal,
    lastFinalVersion: lastFinal?.version ?? null,
    updatedAt: m?.updatedAt.toISOString() ?? null,
    updatedBy: nm(m?.updatedById),
    finalizedAt: m?.finalizedAt?.toISOString() ?? null,
    finalizedBy: nm(m?.finalizedById),
    history,
    revisions: (m?.revisions ?? []).map((r) => ({
      version: r.version, reason: r.reason, finalizedAt: r.finalizedAt.toISOString(), finalizedBy: nm(r.finalizedById), authorName: nm(r.authorId),
      agenda: r.agenda, discussion: r.discussion, decisions: r.decisions,
    })),
    viewer: { canWrite, canFinalize },
    meetingCancelled: e.status === "CANCELLED",
  };
}

async function saveContent(u: AuthUser, eventId: string, c: Content) {
  const cur = await prisma.meetingMinutes.findUnique({ where: { eventId } });
  if (cur && cur.status === "FINAL") throw conflict("Notulen sudah Final. Buat revisi untuk mengubahnya.");
  if (!cur) {
    await prisma.meetingMinutes.create({ data: { eventId, ...sealContent(eventId, c), draftById: u.userId, updatedById: u.userId } });
  } else {
    await prisma.meetingMinutes.update({ where: { eventId }, data: { ...sealContent(eventId, c), updatedById: u.userId } });
  }
  return !cur;
}

export async function saveDraft(u: AuthUser, id: string, c: Content) {
  const { canWrite } = await memberAccess(u, id);
  if (!canWrite) throw await denied(u, id, "menulis notulen");
  const created = await saveContent(u, id, c);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: created ? "meeting.minutes.create" : "meeting.minutes.save", entity: "Event", entityId: id, payload: { chars: c.agenda.length + c.discussion.length + c.decisions.length } });
  return getMinutes(u, id);
}

export async function finalizeMinutes(u: AuthUser, id: string, content?: Content) {
  const { canFinalize } = await memberAccess(u, id);
  if (!canFinalize) throw await denied(u, id, "memfinalkan notulen");
  if (content) await saveContent(u, id, content);
  const m = await prisma.meetingMinutes.findUnique({ where: { eventId: id } });
  if (!m) throw badRequest("Notulen belum ditulis.");
  if (m.status === "FINAL") throw conflict("Notulen ini sudah Final.");
  if (isEmpty({ agenda: openText(id, m.agenda, "agenda"), discussion: openText(id, m.discussion, "discussion"), decisions: openText(id, m.decisions, "decisions") })) throw badRequest("Isi notulen masih kosong. Tulis agenda, pembahasan, atau keputusan dulu.");
  const now = new Date();
  await prisma.$transaction([
    prisma.meetingMinutesRevision.create({
      data: { minutesId: m.id, version: m.version, agenda: ensureEncrypted(m.agenda, scope(id), "agenda"), discussion: ensureEncrypted(m.discussion, scope(id), "discussion"), decisions: ensureEncrypted(m.decisions, scope(id), "decisions"), reason: m.reviseReason ? ensureEncrypted(m.reviseReason, scope(id), "reason") : null, authorId: m.draftById, draftAt: m.draftAt, finalizedById: u.userId, finalizedAt: now },
    }),
    prisma.meetingMinutes.update({ where: { id: m.id }, data: { status: "FINAL", finalizedAt: now, finalizedById: u.userId, updatedById: u.userId } }),
  ]);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.minutes.finalize", entity: "Event", entityId: id, payload: { version: m.version } });
  return getMinutes(u, id);
}

export async function reviseMinutes(u: AuthUser, id: string, reason?: string) {
  const { canFinalize } = await memberAccess(u, id);
  if (!canFinalize) throw await denied(u, id, "membuat revisi notulen");
  const m = await prisma.meetingMinutes.findUnique({ where: { eventId: id } });
  if (!m) throw notFound("Notulen");
  if (m.status !== "FINAL") throw conflict("Notulen masih draf, langsung ubah saja.");
  await prisma.meetingMinutes.update({
    where: { id: m.id },
    data: { status: "DRAFT", version: m.version + 1, reviseReason: reason ? encryptText(reason, scope(id), "reason") : null, draftById: u.userId, draftAt: new Date(), updatedById: u.userId },
  });
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.minutes.revise", entity: "Event", entityId: id, payload: { version: m.version + 1, hasReason: !!reason } }); // alasan revisi tidak dicatat di log
  return getMinutes(u, id);
}

/** Pesan yang tepat bila tidak berhak: rapat dibatalkan, atau jabatannya memang tidak punya hak itu. */
async function denied(u: AuthUser, id: string, what: string) {
  const e = await loadMeeting(u, id);
  return e.status === "CANCELLED" ? conflict("Rapat ini dibatalkan, notulen tidak bisa diubah.") : forbidden(`Jabatan Anda tidak punya hak ${what}.`);
}
