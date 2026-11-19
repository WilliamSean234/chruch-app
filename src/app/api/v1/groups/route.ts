import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { createGroup, groupBody, listGroupOptions, listGroups } from "@/lib/groups";

/** Kelompok yang boleh dilihat: semua untuk Superadmin, selain itu hanya yang diikuti. */
export const GET = handle(async (req: Request) => {
  const u = await requireUser(req);
  // ?untuk=orang: nama semua kelompok untuk saringan tabel Orang, bagi yang berhak mengelola data orang
  if (new URL(req.url).searchParams.get("untuk") === "orang" && can(u, "person.write")) return NextResponse.json({ items: await listGroupOptions(u.tenantId) });
  return NextResponse.json({ items: await listGroups(u) });
});

export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  const g = await createGroup(u, groupBody.parse(await req.json()));
  return NextResponse.json({ id: g.id, name: g.name, quorumMin: g.quorumMin }, { status: 201 });
});
