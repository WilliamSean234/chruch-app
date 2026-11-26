import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { twoFactorStatus } from "@/lib/twoFactor";

export const dynamic = "force-dynamic";

/** Keadaan verifikasi 2 langkah akun ini (tanpa rahasia apa pun). */
export const GET = handle(async (req: Request) => NextResponse.json(await twoFactorStatus(await requireUser(req))));
