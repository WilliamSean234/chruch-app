import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { ApiError, badRequest } from "./errors";
import { appUrl, mailConfigured, sendMail } from "./mailer";

const TTL_MS = 24 * 3_600_000;
const RESEND_GAP_MS = 60_000;

export type VerifyKind = "REGISTRATION" | "ACCOUNT";
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/**
 * Kirim email berisi tautan verifikasi. Jeda minimal 60 detik per tujuan supaya tidak dipakai membanjiri kotak surat.
 * Mengembalikan "OFF" bila email belum diaktifkan di server, "SENT" bila terkirim, "FAILED" bila SMTP menolak.
 */
export async function sendVerification(a: { tenantId: string; kind: VerifyKind; refId: string; email: string; name?: string }): Promise<"OFF" | "SENT" | "FAILED"> {
  if (!mailConfigured()) return "OFF";
  const last = await prisma.emailToken.findFirst({ where: { kind: a.kind, refId: a.refId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (last && Date.now() - last.createdAt.getTime() < RESEND_GAP_MS) throw new ApiError(429, "TOO_MANY", "Email verifikasi baru saja dikirim. Tunggu sekitar satu menit lalu coba lagi.");
  const token = randomBytes(32).toString("base64url");
  await prisma.emailToken.create({ data: { tenantId: a.tenantId, email: a.email, kind: a.kind, refId: a.refId, tokenHash: sha(token), expiresAt: new Date(Date.now() + TTL_MS) } });
  const r = await sendMail({
    to: a.email,
    subject: "Verifikasi email Anda",
    text: `${a.name ? `Halo ${a.name},\n\n` : ""}Buka tautan di bawah untuk memastikan email ini milik Anda. Tautan berlaku 24 jam dan hanya bisa dipakai sekali.\n\nBila Anda tidak merasa mendaftar, abaikan saja email ini.`,
    link: { label: "Verifikasi email", url: `${appUrl()}/verifikasi-email?token=${token}` },
  });
  return r.ok ? "SENT" : "FAILED";
}

/** Pakai token dari tautan. Gagal bila tidak dikenal, kedaluwarsa, atau sudah dipakai. */
export async function confirmVerification(token: string): Promise<{ email: string; kind: VerifyKind }> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw badRequest("Tautan verifikasi tidak valid.");
  const row = await prisma.emailToken.findUnique({ where: { tokenHash: sha(token) } });
  if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) throw badRequest("Tautan verifikasi tidak valid atau sudah kedaluwarsa. Minta email verifikasi yang baru.");
  const claimed = await prisma.emailToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) throw badRequest("Tautan verifikasi ini sudah dipakai.");
  const now = new Date();
  if (row.kind === "REGISTRATION") {
    await prisma.registrationRequest.updateMany({ where: { id: row.refId, email: row.email }, data: { emailVerifiedAt: now } });
  } else {
    await prisma.user.updateMany({ where: { id: row.refId, email: row.email }, data: { emailVerifiedAt: now } }); // hanya bila emailnya belum berganti
  }
  return { email: row.email, kind: row.kind as VerifyKind };
}
