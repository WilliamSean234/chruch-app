import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { confirmVerification } from "@/lib/emailVerify";

/** Publik: memakai token dari tautan di email. Dipanggil oleh halaman /verifikasi-email, bukan langsung dari tautan. */
export const POST = handle(async (req: Request) => {
  const { token } = z.object({ token: z.string().max(200) }).parse(await req.json());
  return NextResponse.json({ ok: true, ...(await confirmVerification(token)) });
});
