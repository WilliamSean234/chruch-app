import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { confirmTwoFactorSetup } from "@/lib/twoFactor";

export const dynamic = "force-dynamic";

const body = z.object({ code: z.string().trim().min(1, "Masukkan kode 6 angka dari aplikasi.").max(20) });

/** Langkah 2: konfirmasi dengan kode dari aplikasi. Berhasil: 2 langkah aktif dan kode cadangan dikembalikan sekali ini saja. */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  const res = NextResponse.json(await confirmTwoFactorSetup(u, body.parse(await req.json().catch(() => ({}))).code));
  res.headers.set("Cache-Control", "no-store");
  return res;
});
