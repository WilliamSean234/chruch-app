import nodemailer, { type Transporter } from "nodemailer";

/**
 * Pengirim email lewat SMTP (mis. Gmail dengan Sandi Aplikasi). Tanpa SMTP_USER dan SMTP_PASS fitur email mati,
 * aplikasi tetap jalan seperti biasa.
 */
export function mailConfig() {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, ""); // Sandi Aplikasi Google biasa ditulis berspasi
  if (!user || !pass) return null;
  const port = Number(process.env.SMTP_PORT?.trim() || 465);
  return { host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com", port, secure: port === 465, user, pass, from: process.env.MAIL_FROM?.trim() || `Penjadwalan Gereja <${user}>` };
}

export const mailConfigured = () => mailConfig() !== null;

/** Alamat dasar aplikasi untuk tautan di email: APP_URL, atau alamat produksi Vercel. */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return vercel ? `https://${vercel}` : "http://localhost:3000";
}

let cached: { key: string; t: Transporter } | null = null;
function transporter(c: NonNullable<ReturnType<typeof mailConfig>>): Transporter {
  const key = `${c.host}:${c.port}:${c.user}`;
  if (!cached || cached.key !== key) cached = { key, t: nodemailer.createTransport({ host: c.host, port: c.port, secure: c.secure, auth: { user: c.user, pass: c.pass } }) };
  return cached.t;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type MailResult = { ok: true } | { ok: false; error: string };

/** Kirim satu email teks. Tidak pernah melempar galat: hasilnya dikembalikan supaya pemanggil memutuskan. */
export async function sendMail(m: { to: string; subject: string; text: string; link?: { label: string; url: string } }): Promise<MailResult> {
  const c = mailConfig();
  if (!c) return { ok: false, error: "Email belum diaktifkan di server." };
  const text = m.link ? `${m.text}\n\n${m.link.label}: ${m.link.url}` : m.text;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#171a2c">${esc(m.text).replace(/\n/g, "<br>")}${m.link ? `<p><a href="${esc(m.link.url)}" style="display:inline-block;background:#3037A8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">${esc(m.link.label)}</a></p><p style="color:#5b6079;font-size:12px">Bila tombol tidak bisa dibuka, salin alamat ini ke browser:<br>${esc(m.link.url)}</p>` : ""}</div>`;
  try {
    await transporter(c).sendMail({ from: c.from, to: m.to, subject: m.subject, text, html });
    return { ok: true };
  } catch (e) {
    console.error("[mail] gagal kirim", e instanceof Error ? e.message : e);
    return { ok: false, error: "Email gagal dikirim." };
  }
}
