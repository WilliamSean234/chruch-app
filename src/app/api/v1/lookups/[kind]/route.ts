import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { forbidden } from "@/lib/errors";
import { createLookup, listLookup, lookupBody, lookupKind } from "@/lib/lookups";
import { audit } from "@/lib/audit";
import { listCgGroupsWithLeaders } from "@/lib/cgLeaders";

type Ctx = { params: Promise<{ kind: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const kind = lookupKind((await params).kind);
  if (kind === "cg-groups") return NextResponse.json({ items: await listCgGroupsWithLeaders(u.tenantId) }); // CG disertai leader-nya
  return NextResponse.json({ items: await listLookup(kind, u.tenantId) });
});

export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  const kind = lookupKind((await params).kind);
  // Superadmin untuk semua daftar. Admin Jemaat hanya menambah yang baru (bukan mengubah atau menghapus) di daftar jemaat:
  // posisi di gereja, komunitas, dan kelompok CG. Ruangan tetap Superadmin.
  const jemaatList = kind === "positions" || kind === "communities" || kind === "cg-groups";
  if (!can(u, "master.write") && !(jemaatList && can(u, "person.manage"))) throw forbidden("Daftar ini hanya bisa ditambah oleh Superadmin, atau Admin Jemaat untuk posisi, komunitas, dan kelompok CG.");
  const body = lookupBody.parse(await req.json());
  const row = await createLookup(kind, u.tenantId, body);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: `${kind}.create`, entity: kind, entityId: String(row.id), payload: { name: body.name } });
  return NextResponse.json(row, { status: 201 });
});
