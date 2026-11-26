import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { beginTwoFactorSetup } from "@/lib/twoFactor";

export const dynamic = "force-dynamic";

/** Langkah 1 pengaktifan: buat kunci dan kembalikan tautan untuk kode QR. Belum berlaku sampai kodenya dikonfirmasi. */
export const POST = handle(async (req: Request) => {
  const res = NextResponse.json(await beginTwoFactorSetup(await requireUser(req)));
  res.headers.set("Cache-Control", "no-store");
  return res;
});
