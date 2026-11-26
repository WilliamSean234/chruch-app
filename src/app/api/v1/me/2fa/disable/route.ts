import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { disableTwoFactor } from "@/lib/twoFactor";

export const dynamic = "force-dynamic";

const body = z.object({ password: z.string().min(1, "Masukkan kata sandi Anda.").max(200), code: z.string().trim().min(1, "Masukkan kode 6 angka atau kode cadangan.").max(20) });

/** Matikan 2 langkah akun sendiri (kata sandi + satu kode). */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  await disableTwoFactor(u, body.parse(await req.json().catch(() => ({}))));
  return NextResponse.json({ ok: true });
});
