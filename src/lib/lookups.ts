import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { conflict, notFound } from "./errors";

/** Tabel dinamis bernama sederhana: posisi orang, kelompok CG, komunitas, ruangan. */
export const LOOKUP_KINDS = {
  positions: { label: "Posisi", delegate: () => prisma.personPosition },
  "cg-groups": { label: "Kelompok CG", delegate: () => prisma.cgGroup },
  communities: { label: "Komunitas", delegate: () => prisma.community },
  rooms: { label: "Ruangan", delegate: () => prisma.room },
} as const;
export type LookupKind = keyof typeof LOOKUP_KINDS;

export function lookupKind(kind: string): LookupKind {
  if (!(kind in LOOKUP_KINDS)) throw notFound("Jenis data");
  return kind as LookupKind;
}

export const lookupBody = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(80),
  sortOrder: z.number().int().optional(), // hanya posisi
  isActive: z.boolean().optional(), // hanya ruangan
  floor: z.number().int().min(-5).max(99).nullable().optional(), // hanya ruangan; null = kosongkan
});

// delegate beragam tipe; di sini kita pakai bentuk umum yang sama-sama dimiliki keempat tabel
type Delegate = {
  findMany: (a: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (a: unknown) => Promise<Record<string, unknown> | null>;
  create: (a: unknown) => Promise<Record<string, unknown>>;
  update: (a: unknown) => Promise<Record<string, unknown>>;
};
const d = (kind: LookupKind) => LOOKUP_KINDS[kind].delegate() as unknown as Delegate;

function dataFor(kind: LookupKind, b: z.infer<typeof lookupBody>) {
  const data: Record<string, unknown> = { name: b.name };
  if (kind === "positions" && b.sortOrder !== undefined) data.sortOrder = b.sortOrder;
  if (kind === "rooms" && b.isActive !== undefined) data.isActive = b.isActive;
  if (kind === "rooms" && b.floor !== undefined) data.floor = b.floor;
  return data;
}

export const listLookup = (kind: LookupKind, tenantId: string) =>
  d(kind).findMany({
    where: { tenantId, deletedAt: null, ...(kind === "rooms" ? { isOnline: false } : {}) }, // ruangan maya "Online" tidak ikut daftar
    // ruangan diurutkan per lantai (yang belum berlantai di akhir), lalu kode
    orderBy: kind === "rooms" ? [{ floor: { sort: "asc", nulls: "last" } }, { name: "asc" }] : { name: "asc" },
  });

export async function createLookup(kind: LookupKind, tenantId: string, body: z.infer<typeof lookupBody>) {
  // nama yang pernah dihapus (soft delete) dihidupkan kembali agar tidak bentrok dengan unique
  const old = await d(kind).findFirst({ where: { tenantId, name: body.name } });
  if (old && old.deletedAt === null) throw conflict(`${LOOKUP_KINDS[kind].label} "${body.name}" sudah ada.`);
  if (old) return d(kind).update({ where: { id: old.id }, data: { ...dataFor(kind, body), deletedAt: null } });
  return d(kind).create({ data: { tenantId, ...dataFor(kind, body) } });
}

export async function updateLookup(kind: LookupKind, tenantId: string, id: string, body: z.infer<typeof lookupBody>) {
  const row = await d(kind).findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!row) throw notFound(LOOKUP_KINDS[kind].label);
  try {
    return await d(kind).update({ where: { id }, data: dataFor(kind, body) });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict(`Nama "${body.name}" sudah dipakai.`);
    throw e;
  }
}

export async function deleteLookup(kind: LookupKind, tenantId: string, id: string) {
  const row = await d(kind).findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!row) throw notFound(LOOKUP_KINDS[kind].label);
  // data yang masih dipakai tidak boleh dihapus
  const inUse =
    kind === "positions" ? await prisma.person.count({ where: { positionId: id, deletedAt: null } })
    : kind === "cg-groups" ? await prisma.person.count({ where: { cgGroupId: id, deletedAt: null } })
    : kind === "communities" ? await prisma.personCommunity.count({ where: { communityId: id, person: { deletedAt: null } } })
    : await prisma.event.count({ where: { roomId: id, deletedAt: null, status: { not: "CANCELLED" }, endsAt: { gte: new Date() } } });
  if (inUse > 0) {
    throw conflict(
      kind === "rooms"
        ? "Ruangan masih dipakai acara yang akan datang. Nonaktifkan saja atau pindahkan acaranya dulu."
        : `Masih dipakai oleh ${inUse} orang. Pindahkan dulu sebelum menghapus.`,
    );
  }
  await d(kind).update({ where: { id }, data: { deletedAt: new Date() } });
}
