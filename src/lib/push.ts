import webpush from "web-push";
import { isPushEndpoint } from "./pushRules";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** Kunci VAPID dari environment. null = notifikasi HP belum diaktifkan di server. */
export function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com" };
}

export type PushOutcome = { result: "ok" | "gone" | "error"; status?: number; reason?: string };

/** Seperti sendPush, tetapi menyertakan kode dan alasan penolakan dari layanan push. */
export async function sendPushDetailed(t: PushTarget, p: PushPayload): Promise<PushOutcome> {
  const cfg = pushConfig();
  if (!cfg) return { result: "error", reason: "Kunci VAPID belum diisi di server" };
  // alamat di luar layanan push resmi tidak pernah dihubungi (data lama atau yang dipalsukan): dianggap tidak berlaku dan dibuang oleh pemanggil
  if (!isPushEndpoint(t.endpoint)) return { result: "gone", reason: "Alamat perangkat bukan layanan push resmi" };
  try {
    await webpush.sendNotification(
      { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
      JSON.stringify({ title: p.title, body: p.body, url: p.url ?? "/", tag: p.tag }),
      { TTL: 60 * 60 * 24, urgency: "normal", vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey } },
    );
    return { result: "ok" };
  } catch (e) {
    const err = e as { statusCode?: number; body?: string; message?: string };
    const status = err.statusCode;
    const reason = (err.body || err.message || "").toString().slice(0, 200);
    console.error(`[push] gagal kirim (${status ?? "tanpa kode"}) ${new URL(t.endpoint).host}: ${reason}`);
    return { result: status === 404 || status === 410 ? "gone" : "error", status, reason };
  }
}

/** ok = terkirim ke layanan push; gone = perangkat sudah tidak berlaku (hapus); error = gagal sementara. */
export async function sendPush(t: PushTarget, p: PushPayload): Promise<"ok" | "gone" | "error"> {
  return (await sendPushDetailed(t, p)).result;
}
