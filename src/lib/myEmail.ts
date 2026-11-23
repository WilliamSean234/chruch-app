import { prisma } from "./prisma";
import { ApiError, badRequest, conflict, notFound } from "./errors";
import { mailConfigured } from "./mailer";
import { sendVerification } from "./emailVerify";
import type { AuthUser } from "./rbac";

export async function getMyEmail(u: AuthUser) {
  const me = await prisma.user.findUnique({ where: { id: u.userId }, select: { email: true, emailVerifiedAt: true } });
  if (!me) throw notFound("Akun");
  return { email: me.email, verified: !!me.emailVerifiedAt, mailOn: mailConfigured() };
}

/** Kirim email berisi tautan verifikasi ke alamat akun ini. */
export async function requestMyEmailVerification(u: AuthUser) {
  const me = await prisma.user.findUnique({ where: { id: u.userId }, select: { email: true, emailVerifiedAt: true } });
  if (!me) throw notFound("Akun");
  if (me.emailVerifiedAt) throw conflict("Email Anda sudah terverifikasi.");
  const r = await sendVerification({ tenantId: u.tenantId, kind: "ACCOUNT", refId: u.userId, email: me.email });
  if (r === "OFF") throw badRequest("Pengiriman email belum diaktifkan oleh pengelola aplikasi.");
  if (r === "FAILED") throw new ApiError(502, "MAIL_FAILED", "Email gagal dikirim. Pastikan alamat emailnya benar, lalu coba lagi nanti.");
  return { sent: true, email: me.email };
}
