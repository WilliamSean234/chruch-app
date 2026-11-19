import { NextResponse } from "next/server";
import { handle } from "@/lib/errors";
import { registerBody, submitRegistration } from "@/lib/registrations";
import { clientIp } from "@/lib/throttle";

/** Publik (tanpa login): mengirim permintaan daftar akun. Admin yang menyetujui. */
export const POST = handle(async (req: Request) => {
  const body = registerBody.parse(await req.json());
  const r = await submitRegistration(body, clientIp(req.headers));
  return NextResponse.json(r, { status: 201 });
});
