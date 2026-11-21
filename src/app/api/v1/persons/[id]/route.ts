import { NextResponse } from "next/server";
import { forbidden, handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { can, isSuperadmin, requirePermission } from "@/lib/rbac";
import { deletePerson, getPerson, personBody, updatePerson } from "@/lib/persons";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "calendar.read");
  const p = await getPerson(u.tenantId, (await params).id);
  if (!can(u, "person.write")) return NextResponse.json({ id: p.id, name: p.name, title: p.title }); // data pribadi hanya untuk pengelola
  return NextResponse.json(p);
});

export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "person.write");
  const { id } = await params;
  const p = await updatePerson(u, id, personBody.parse(await req.json()));
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "person.update", entity: "Person", entityId: id });
  return NextResponse.json(p);
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "person.write");
  if (!isSuperadmin(u)) throw forbidden("Hanya Superadmin yang boleh menghapus orang.");
  const { id } = await params;
  await deletePerson(u.tenantId, id);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "person.delete", entity: "Person", entityId: id });
  return new Response(null, { status: 204 });
});
