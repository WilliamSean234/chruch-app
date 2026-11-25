import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { authorizeCredentials, SESSION_MAX_AGE, SESSION_SALT } from "@/lib/auth";
import { ApiError, handle, unauthorized } from "@/lib/errors";
import { LoginLocked } from "@/lib/loginThrottle";
import { clientIp } from "@/lib/throttle";

/** Login untuk aplikasi native: kirim email+password, terima Bearer token. */
export const POST = handle(async (req: Request) => {
  const body = await req.json().catch(() => null);
  let u;
  try {
    u = await authorizeCredentials(body, clientIp(req.headers));
  } catch (e) {
    if (e instanceof LoginLocked) throw new ApiError(429, "TOO_MANY_ATTEMPTS", e.message, { retryAfterMinutes: e.minutes });
    throw e;
  }
  if (!u) throw unauthorized();
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET belum diisi");
  const { email, ...claims } = u;
  const token = await encode({ token: { ...claims, email, sub: u.userId, authAt: Date.now() }, secret, salt: SESSION_SALT, maxAge: SESSION_MAX_AGE });
  return NextResponse.json({ token, expiresIn: SESSION_MAX_AGE });
});
