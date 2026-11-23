import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { getMyEmail, requestMyEmailVerification } from "@/lib/myEmail";

export const GET = handle(async (req: Request) => NextResponse.json(await getMyEmail(await requireUser(req))));

/** Kirim email verifikasi ke alamat akun sendiri. */
export const POST = handle(async (req: Request) => NextResponse.json(await requestMyEmailVerification(await requireUser(req))));
