import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { beat, leave } from "@/lib/presence";
import { validClientId } from "@/lib/presenceRules";

const body = z.object({ clientId: z.string().refine(validClientId, "clientId tidak valid"), state: z.enum(["on", "off"]) });

/**
 * Tanda "sedang membuka aplikasi" dari satu tab. state=on dikirim tiap beberapa detik selama tab terlihat dan dipakai;
 * state=off dikirim saat tab ditutup, disembunyikan, atau pemiliknya diam (lewat sendBeacon, jadi isinya teks JSON biasa).
 */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req, { allowMustChange: true });
  const b = body.parse(await req.text().then((t) => JSON.parse(t) as unknown).catch(() => null));
  if (b.state === "on") await beat(u.tenantId, u.userId, b.clientId);
  else await leave(u.userId, b.clientId);
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
