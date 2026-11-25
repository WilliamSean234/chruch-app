import { z } from "zod";
import { prisma } from "./prisma";
import { badRequest } from "./errors";
import { can, isSuperadmin, type AuthUser } from "./rbac";
import { AUDIENCE_LABEL, isNotifKind, kindsFor, type Audience } from "./notificationKinds";
import { pushConfig, sendPushDetailed } from "./push";
import { isPushEndpoint } from "./pushRules";

const MAX_DEVICES = 5;

export const subscribeBody = z.object({
  endpoint: z.string().url().max(1000).refine(isPushEndpoint, "Alamat perangkat tidak dikenal. Aktifkan notifikasi dari browser di HP ini."),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(5).max(300) }),
  userAgent: z.string().max(300).optional(),
});
export const unsubscribeBody = z.object({ endpoint: z.string().url().max(1000) });
export const prefsBody = z.object({ off: z.array(z.string()).max(50) });

/** Nama perangkat yang ramah dibaca dari user agent. */
function deviceLabel(ua: string | null): string {
  const s = ua ?? "";
  const os = /iPhone|iPad|iPod/.test(s) ? "iPhone" : /Android/.test(s) ? "Android" : /Windows/.test(s) ? "Windows" : /Mac OS X|Macintosh/.test(s) ? "Mac" : "Perangkat";
  const br = /Edg\//.test(s) ? "Edge" : /Chrome\//.test(s) ? "Chrome" : /Firefox\//.test(s) ? "Firefox" : /Safari\//.test(s) ? "Safari" : "";
  return br ? `${os} · ${br}` : os;
}

/** Peran notifikasi yang berlaku untuk akun ini: semua akun, pelayan (punya data Orang), penjadwal, anggota kelompok. */
async function audiencesOf(u: AuthUser): Promise<Audience[]> {
  const out: Audience[] = ["SEMUA"]; // setiap pemilik akun
  if (u.personId) out.push("PELAYAN");
  if (can(u, "event.write")) out.push("PENJADWAL");
  if (isSuperadmin(u)) out.push("SUPERADMIN");
  if (can(u, "assignment.write")) out.push("PENGELOLA"); // Penjadwal dan Admin Tim: menerima permintaan pengganti
  if (u.personId && (await prisma.groupMember.count({ where: { personId: u.personId, leftAt: null, group: { tenantId: u.tenantId, deletedAt: null } } })) > 0) out.push("KELOMPOK");
  return out;
}

export async function getMyNotifications(u: AuthUser) {
  const [me, subs, audiences] = await Promise.all([
    prisma.user.findUnique({ where: { id: u.userId }, select: { notifyOff: true } }),
    prisma.pushSubscription.findMany({ where: { userId: u.userId }, orderBy: { createdAt: "asc" }, select: { id: true, endpoint: true, userAgent: true, createdAt: true } }),
    audiencesOf(u),
  ]);
  const cfg = pushConfig();
  return {
    configured: !!cfg,
    publicKey: cfg?.publicKey ?? null,
    devices: subs.map((s) => ({ id: s.id, endpoint: s.endpoint, label: deviceLabel(s.userAgent), createdAt: s.createdAt.toISOString() })),
    off: me?.notifyOff ?? [],
    audiences: audiences.map((a) => ({ audience: a, label: AUDIENCE_LABEL[a] })),
    kinds: kindsFor(audiences),
  };
}

export async function setMyNotificationPrefs(u: AuthUser, b: z.infer<typeof prefsBody>) {
  const off = [...new Set(b.off)].filter(isNotifKind);
  await prisma.user.update({ where: { id: u.userId }, data: { notifyOff: off } });
  return { off };
}

export async function addMyDevice(u: AuthUser, b: z.infer<typeof subscribeBody>) {
  if (!pushConfig()) throw badRequest("Notifikasi HP belum diaktifkan oleh pengelola aplikasi.");
  const data = { tenantId: u.tenantId, userId: u.userId, p256dh: b.keys.p256dh, auth: b.keys.auth, userAgent: b.userAgent ?? null };
  await prisma.pushSubscription.upsert({ where: { endpoint: b.endpoint }, create: { endpoint: b.endpoint, ...data }, update: data });
  // batasi jumlah perangkat per akun: yang paling lama dilepas
  const all = await prisma.pushSubscription.findMany({ where: { userId: u.userId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (all.length > MAX_DEVICES) await prisma.pushSubscription.deleteMany({ where: { id: { in: all.slice(MAX_DEVICES).map((x) => x.id) } } });
  return { ok: true };
}

export async function removeMyDevice(u: AuthUser, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId: u.userId, endpoint } });
  return { ok: true };
}

/** Kirim satu pesan percobaan ke semua perangkat akun ini (tidak dicatat di log). */
export async function sendMyTest(u: AuthUser) {
  const subs = await prisma.pushSubscription.findMany({ where: { userId: u.userId } });
  if (subs.length === 0) throw badRequest("Belum ada perangkat yang aktif. Aktifkan notifikasi di HP ini dulu.");
  const results = await Promise.all(subs.map(async (s) => ({ s, r: await sendPushDetailed(s, { title: "Tes notifikasi", body: "Notifikasi di perangkat ini sudah berfungsi.", url: "/profil", tag: "tes" }) })));
  const gone = results.filter((x) => x.r.result === "gone").map((x) => x.s.id);
  if (gone.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
  const fail = results.find((x) => x.r.result !== "ok")?.r;
  return {
    sent: results.filter((x) => x.r.result === "ok").length,
    devices: subs.length,
    failStatus: fail?.status ?? null,
    failReason: fail ? fail.reason ?? null : null,
  };
}
