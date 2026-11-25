import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { badRequest } from "./errors";
import { cleanOnlineUrl, linkVisible } from "./onlineRules";
import { can, type AuthUser } from "./rbac";
import { openOnlineUrl, openSpeaker, sealOnlineUrl, sealSpeaker } from "./meetingCrypto";

/**
 * Acara online (ibadah dan rapat kelompok). Acara online tidak memakai ruangan fisik: ia dipasang di ruangan maya "Online"
 * (Room.isOnline) yang tidak muncul di daftar ruangan dan tidak membuat pemesanan, jadi tidak bisa bentrok ruangan.
 * Isinya: tautan meeting, tema (kolom theme), pembicara (dari daftar Orang atau diketik), dan jam (jam acara biasa).
 * Penerima tautan: ibadah = semua orang atau komunitas tertentu; rapat = selalu hanya anggota kelompok.
 */
export const ONLINE_ROOM_NAME = "Online";

type Db = Prisma.TransactionClient | typeof prisma;

/** Ruangan maya "Online" milik gereja; dibuat bila belum ada. */
export async function ensureOnlineRoom(db: Db, tenantId: string): Promise<string> {
  const found = await db.room.findFirst({ where: { tenantId, isOnline: true }, select: { id: true, deletedAt: true } });
  if (found) {
    if (found.deletedAt) await db.room.update({ where: { id: found.id }, data: { deletedAt: null, isActive: true } });
    return found.id;
  }
  const taken = await db.room.findFirst({ where: { tenantId, name: ONLINE_ROOM_NAME }, select: { id: true } });
  const created = await db.room.create({ data: { tenantId, name: taken ? `${ONLINE_ROOM_NAME} (maya)` : ONLINE_ROOM_NAME, isOnline: true, isActive: true } });
  return created.id;
}

/** Isian acara online di permintaan buat/ubah acara. `online` kosong = tidak diubah (pada ubah). */
export const onlineFields = {
  online: z.boolean().optional(),
  onlineUrl: z.string().trim().max(500).nullish(),
  speakerPersonId: z.string().uuid().nullish(),
  speakerName: z.string().trim().max(120).nullish(),
  onlineCommunityIds: z.array(z.string().uuid()).max(30).optional(),
};
export type OnlineInput = { online?: boolean; onlineUrl?: string | null; speakerPersonId?: string | null; speakerName?: string | null; onlineCommunityIds?: string[] };

export type OnlineValues = { isOnline: boolean; onlineUrl: string | null; speakerPersonId: string | null; speakerName: string | null; onlineCommunityIds: string[] };
export const NOT_ONLINE: OnlineValues = { isOnline: false, onlineUrl: null, speakerPersonId: null, speakerName: null, onlineCommunityIds: [] };

/**
 * Periksa isian online dan ubah ke nilai yang siap disimpan (tautan dan nama pembicara luar disegel dengan id acara).
 * `kind` RAPAT: penerima tautan selalu anggota kelompok, jadi daftar komunitas dikosongkan.
 * Mengembalikan undefined bila `online` tidak dikirim (tidak ada yang berubah).
 */
export async function prepareOnline(tenantId: string, eventId: string, b: OnlineInput, kind: "IBADAH" | "RAPAT"): Promise<OnlineValues | undefined> {
  if (b.online === undefined) return undefined;
  if (!b.online) return NOT_ONLINE;
  const url = cleanOnlineUrl(b.onlineUrl);
  let speakerPersonId: string | null = null;
  let speakerName: string | null = null;
  if (b.speakerPersonId) {
    if (!(await prisma.person.count({ where: { id: b.speakerPersonId, tenantId, deletedAt: null } }))) throw badRequest("Pembicara tidak ditemukan di daftar Orang.");
    speakerPersonId = b.speakerPersonId;
  } else if (b.speakerName?.trim()) {
    speakerName = b.speakerName.trim();
  }
  let communityIds: string[] = [];
  if (kind === "IBADAH" && b.onlineCommunityIds?.length) {
    communityIds = [...new Set(b.onlineCommunityIds)];
    if ((await prisma.community.count({ where: { id: { in: communityIds }, tenantId, deletedAt: null } })) !== communityIds.length) throw badRequest("Ada komunitas yang tidak valid.");
  }
  return { isOnline: true, onlineUrl: sealOnlineUrl(eventId, url), speakerPersonId, speakerName: sealSpeaker(eventId, speakerName), onlineCommunityIds: communityIds };
}

/** Pembukaan yang tidak melempar galat: tautan yang tidak terbuka (kunci beda) tampil kosong, bukan merusak halaman. */
const tryOpen = (f: () => string | null): string | null => { try { return f(); } catch { return null; } };

export type OnlineView =
  | { isOnline: false }
  | { isOnline: true; url: string | null; canSeeLink: boolean; speaker: { personId: string | null; name: string } | null; communities: { id: string; name: string }[]; visibleTo: "ALL" | "COMMUNITIES" };

type OnlineRow = { id: string; isOnline: boolean; onlineUrl: string | null; speakerPersonId: string | null; speakerName: string | null; onlineCommunityIds: string[] };

/**
 * Rincian online satu ibadah untuk `viewer`. Tautan hanya terisi bila viewer berhak (canSeeOnlineLink); tanpa viewer tautan selalu kosong.
 * Pembicara dan penerima tautan terlihat oleh semua orang yang bisa melihat acara.
 */
export async function onlineView(tenantId: string, viewer: AuthUser | undefined, e: OnlineRow, assignedPersonIds: (string | null)[]): Promise<OnlineView> {
  if (!e.isOnline) return { isOnline: false };
  const [person, communities, allowed] = await Promise.all([
    e.speakerPersonId ? prisma.person.findFirst({ where: { id: e.speakerPersonId, tenantId }, select: { id: true, name: true } }) : null,
    e.onlineCommunityIds.length ? prisma.community.findMany({ where: { id: { in: e.onlineCommunityIds }, tenantId }, select: { id: true, name: true } }) : [],
    viewer ? canSeeOnlineLink(viewer, { onlineCommunityIds: e.onlineCommunityIds, speakerPersonId: e.speakerPersonId, assignedPersonIds }) : false,
  ]);
  const typed = e.speakerName ? tryOpen(() => openSpeaker(e.id, e.speakerName)) : null;
  return {
    isOnline: true,
    url: allowed ? tryOpen(() => openOnlineUrl(e.id, e.onlineUrl)) : null,
    canSeeLink: allowed,
    speaker: person ? { personId: person.id, name: person.name } : typed ? { personId: null, name: typed } : null,
    communities,
    visibleTo: e.onlineCommunityIds.length ? "COMMUNITIES" : "ALL",
  };
}

/** Boleh melihat tautan ibadah online ini? Aturannya di onlineRules.linkVisible; di sini hanya mengumpulkan faktanya. */
export async function canSeeOnlineLink(u: AuthUser, e: { onlineCommunityIds: string[]; speakerPersonId: string | null; assignedPersonIds: (string | null)[] }): Promise<boolean> {
  const scheduler = can(u, "event.write");
  const involved = !!u.personId && (e.speakerPersonId === u.personId || e.assignedPersonIds.includes(u.personId));
  const inCommunity = !scheduler && !involved && e.onlineCommunityIds.length > 0 && !!u.personId
    && (await prisma.personCommunity.count({ where: { personId: u.personId, communityId: { in: e.onlineCommunityIds } } })) > 0;
  return linkVisible({ scheduler, restricted: e.onlineCommunityIds.length > 0, involved, inCommunity });
}
