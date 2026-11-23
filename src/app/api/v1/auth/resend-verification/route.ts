import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { resendBody, resendRegistrationVerification } from "@/lib/registrations";

/** Publik: kirim ulang email verifikasi untuk permintaan daftar yang masih menunggu. */
export const POST = handle(async (req: Request) => {
  return NextResponse.json(await resendRegistrationVerification(resendBody.parse(await req.json())));
});
