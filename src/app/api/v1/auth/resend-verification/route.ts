import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { resendBody, resendRegistrationVerification } from "@/lib/registrations";
import { LIMITS, rateLimit } from "@/lib/rateLimit";
import { clientIp } from "@/lib/throttle";

/** Publik: kirim ulang email verifikasi untuk permintaan daftar yang masih menunggu. */
export const POST = handle(async (req: Request) => {
  await rateLimit(`resend:${clientIp(req.headers)}`, LIMITS.resend); // per alamat, supaya tidak dipakai membanjiri kotak surat orang lain
  return NextResponse.json(await resendRegistrationVerification(resendBody.parse(await req.json())));
});
