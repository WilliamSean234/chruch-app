import { prisma } from "./prisma";
import { pushConfig, sendPush } from "./push";
import type { NotifKind } from "./notificationKinds";

export type Notice = {
  kind: NotifKind;
  /** Kunci pesan; pesan dengan kunci yang sama tidak dikirim dua kali ke orang yang sama. Mis. `event:<id>:h1:2026-11-23`. */
  dedupeKey: string;
  title: string;
  body: string;
  url?: string;
};

/** Hasil per akun: terkirim, dimatikan pemiliknya, sudah pernah terkirim, belum punya perangkat, atau gagal. */
export type NoticeResult = { sent: string[]; off: string[]; duplicate: string[]; noDevice: string[]; failed: string[] };

/** userId akun aktif untuk daftar orang (Person). Orang tanpa akun tidak ikut. */
export async function userIdsForPersons(tenantId: string, personIds: string[]): Promise<Map<string, string>> {
  if (!personIds.length) return new Map();
  const users = await prisma.user.findMany({ where: { tenantId, personId: { in: personIds }, isActive: true, deletedAt: null }, select: { id: true, personId: true } });
  return new Map(users.flatMap((u) => (u.personId ? [[u.personId, u.id] as const] : [])));
}

/**
 * Kirim satu notifikasi ke beberapa akun lewat Web Push. Menghormati pengaturan pemilik akun (notifyOff) dan
 * tidak mengirim ulang pesan dengan `dedupeKey` yang sama. Dicatat ke log hanya bila ada perangkat yang menerima,
 * sehingga orang yang baru mengaktifkan notifikasi masih bisa menerimanya pada percobaan berikutnya.
 */
export async function notifyUsers(tenantId: string, userIds: string[], n: Notice): Promise<NoticeResult> {
  const res: NoticeResult = { sent: [], off: [], duplicate: [], noDevice: [], failed: [] };
  const ids = [...new Set(userIds)];
  if (!ids.length) return res;
  if (!pushConfig()) { res.noDevice.push(...ids); return res; }

  const [users, logs] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId, id: { in: ids }, isActive: true, deletedAt: null },
      select: { id: true, notifyOff: true, pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } } },
    }),
    prisma.notificationLog.findMany({ where: { userId: { in: ids }, dedupeKey: n.dedupeKey }, select: { userId: true } }),
  ]);
  const done = new Set(logs.map((l) => l.userId));

  const todo = users.filter((u) => {
    if (u.notifyOff.includes(n.kind)) { res.off.push(u.id); return false; }
    if (done.has(u.id)) { res.duplicate.push(u.id); return false; }
    if (u.pushSubscriptions.length === 0) { res.noDevice.push(u.id); return false; }
    return true;
  });

  for (let i = 0; i < todo.length; i += 10) {
    await Promise.all(todo.slice(i, i + 10).map(async (u) => {
      const outcomes = await Promise.all(u.pushSubscriptions.map(async (s) => ({ s, r: await sendPush(s, { title: n.title, body: n.body, url: n.url, tag: n.dedupeKey }) })));
      const gone = outcomes.filter((o) => o.r === "gone").map((o) => o.s.id);
      if (gone.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
      const okIds = outcomes.filter((o) => o.r === "ok").map((o) => o.s.id);
      if (okIds.length === 0) { (gone.length === u.pushSubscriptions.length ? res.noDevice : res.failed).push(u.id); return; }
      await prisma.pushSubscription.updateMany({ where: { id: { in: okIds } }, data: { lastUsedAt: new Date() } });
      await prisma.notificationLog.create({ data: { tenantId, userId: u.id, kind: n.kind, dedupeKey: n.dedupeKey, title: n.title, body: n.body, url: n.url ?? null, devices: okIds.length } }).catch(() => undefined); // balapan: sudah tercatat
      res.sent.push(u.id);
    }));
  }
  return res;
}
