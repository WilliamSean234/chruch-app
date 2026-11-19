import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { pageOf, pagingQuery, resolvePaging } from "./paging";

export const roomListQuery = z.object({
  search: z.string().trim().max(80).optional(),
  floor: z.union([z.coerce.number().int().min(-5).max(99), z.literal("NONE")]).optional(), // NONE = lantai belum diisi
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  ...pagingQuery,
});

/** Daftar ruangan berhalaman, urut per lantai lalu kode; disertai pemakaian mendatang dan pilihan lantai untuk filter. */
export async function listRooms(tenantId: string, q: z.infer<typeof roomListQuery>) {
  const pg = resolvePaging(q);
  const where: Prisma.RoomWhereInput = {
    tenantId, deletedAt: null,
    ...(q.search ? { name: { contains: q.search, mode: "insensitive" } } : {}),
    ...(q.floor === "NONE" ? { floor: null } : q.floor !== undefined ? { floor: q.floor } : {}),
    ...(q.status ? { isActive: q.status === "ACTIVE" } : {}),
  };
  const [total, rows, floorRows] = await Promise.all([
    prisma.room.count({ where }),
    prisma.room.findMany({ where, orderBy: [{ floor: { sort: "asc", nulls: "last" } }, { name: "asc" }], skip: pg.skip, take: pg.take }),
    prisma.room.findMany({ where: { tenantId, deletedAt: null }, distinct: ["floor"], select: { floor: true }, orderBy: { floor: { sort: "asc", nulls: "last" } } }),
  ]);
  const upcoming = rows.length
    ? await prisma.booking.groupBy({ by: ["resourceId"], where: { tenantId, resourceType: "ROOM", resourceId: { in: rows.map((r) => r.id) }, deletedAt: null, endsAt: { gte: new Date() } }, _count: { _all: true } })
    : [];
  const up = new Map(upcoming.map((u) => [u.resourceId, u._count._all]));
  const items = rows.map((r) => ({ id: r.id, name: r.name, floor: r.floor, isActive: r.isActive, upcoming: up.get(r.id) ?? 0 }));
  return {
    ...pageOf(items, total, pg),
    options: { floors: floorRows.map((f) => f.floor).filter((f): f is number => f !== null), hasNoFloor: floorRows.some((f) => f.floor === null) },
  };
}
