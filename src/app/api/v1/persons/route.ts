import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { can, requirePermission } from "@/lib/rbac";
import { createPerson, listPersons, personBody } from "@/lib/persons";
import { audit } from "@/lib/audit";
import { pagingQuery } from "@/lib/paging";

const query = z.object({
  search: z.string().optional(),
  ministryId: z.union([z.string().uuid(), z.literal("NONE")]).optional(), // NONE = belum punya pelayanan
  communityId: z.string().uuid().optional(),
  teamTypeId: z.string().uuid().optional(),
  positionId: z.string().uuid().optional(),
  cgGroupId: z.union([z.string().uuid(), z.literal("NONE")]).optional(), // NONE = belum punya CG
  role: z.enum(["NO_ACCOUNT", "NO_ROLE", "SUPERADMIN", "PENJADWAL", "ADMIN_TIM", "PETUGAS_ABSEN", "PELAYAN", "PENGAWAS"]).optional(), // NO_ACCOUNT = belum punya akun, NO_ROLE = akun tanpa role
  groupId: z.union([z.string().uuid(), z.literal("NONE")]).optional(), // kelompok rapat; untuk yang berhak mengelola data orang
  gender: z.enum(["L", "P"]).optional(),
  origin: z.enum(["DALAM", "LUAR"]).optional(),
  ageMin: z.coerce.number().int().min(0).max(120).optional(),
  ageMax: z.coerce.number().int().min(0).max(120).optional(),
  ...pagingQuery,
});

export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "calendar.read");
  const q = query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const res = await listPersons(u, q);
  // Orang yang tidak berhak mengelola data orang hanya perlu nama (untuk mencari jadwal): tanpa tanggal lahir, email, dll.
  if (!can(u, "person.write")) return NextResponse.json({ ...res, items: res.items.map((p) => ({ id: p.id, name: p.name, title: p.title })) });
  return NextResponse.json(res);
});

export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  requirePermission(u, "person.write");
  const p = await createPerson(u, personBody.parse(await req.json()));
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "person.create", entity: "Person", entityId: p.id, payload: { name: p.name } });
  return NextResponse.json(p, { status: 201 });
});
