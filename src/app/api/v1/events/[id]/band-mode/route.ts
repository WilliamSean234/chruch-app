import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { bandModeBody, setBandMode } from "@/lib/events";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/** Ubah acara menjadi Band atau No Band. Izin seperti mengatur kursi (Admin Tim hanya bila mengurus tim pemusik). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const u = await requireUser(req);
  requirePermission(u, "assignment.write");
  const { id } = await params;
  const { bandMode, alsoPair } = bandModeBody.parse(await req.json());
  const r = await setBandMode(u, id, bandMode);
  // juga ubah Ibadah Minggu pasangan, bila diminta; yang ditolak dilaporkan, tidak menggagalkan perubahan utama
  let pairNote: string | null = null;
  const pair = r.event.pair;
  if (alsoPair && pair) {
    try {
      const pr = await setBandMode(u, pair.id, bandMode);
      pairNote = `${pair.title} juga diubah ke ${bandMode === "NO_BAND" ? "No Band" : "Band"}.${pr.released.length ? ` Orang yang dilepas di sana: ${pr.released.join(", ")}.` : ""}`;
      await audit({ tenantId: u.tenantId, userId: u.userId, action: "event.band-mode", entity: "Event", entityId: pair.id, payload: { bandMode, removed: pr.removed, restored: pr.restored, released: pr.released, mirroredFrom: id } });
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      pairNote = `${pair.title} tidak ikut diubah: ${err.message}`;
    }
  } else if (alsoPair) pairNote = "Tidak ada Ibadah Minggu pasangan yang bisa diubah.";
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "event.band-mode", entity: "Event", entityId: id, payload: { bandMode, removed: r.removed, restored: r.restored, released: r.released } });
  return NextResponse.json({ ...r, pairNote });
});
