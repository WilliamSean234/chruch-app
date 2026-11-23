import webpush from "web-push";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** Kunci VAPID dari environment. null = notifikasi HP belum diaktifkan di server. */
export function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.com" };
}

/** ok = terkirim ke layanan push; gone = perangkat sudah tidak berlaku (hapus); error = gagal sementara. */
export async function sendPush(t: PushTarget, p: PushPayload): Promise<"ok" | "gone" | "error"> {
  const cfg = pushConfig();
  if (!cfg) return "error";
  try {
    await webpush.sendNotification(
      { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
      JSON.stringify({ title: p.title, body: p.body, url: p.url ?? "/", tag: p.tag }),
      { TTL: 60 * 60 * 24, urgency: "normal", vapidDetails: { subject: cfg.subject, publicKey: cfg.publicKey, privateKey: cfg.privateKey } },
    );
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "error";
  }
}
