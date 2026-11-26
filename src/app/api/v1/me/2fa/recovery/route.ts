import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { regenerateRecoveryCodes } from "@/lib/twoFactor";

export const dynamic = "force-dynamic";

const body = z.object({ code: z.string().trim().min(1, "Masukkan kode 6 angka dari aplikasi.").max(20) });

/** Buat kode cadangan baru; yang lama hangus. Kodenya hanya dikembalikan sekali ini. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  const res = NextResponse.json(await regenerateRecoveryCodes(u, body.parse(await req.json().catch(() => ({})))));
  res.headers.set("Cache-Control", "no-store");
  return res;
});
