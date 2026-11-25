import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/errors";
import { requireUser } from "@/lib/session";
import { audit } from "@/lib/audit";
import { unlockWithPassword } from "@/lib/notulenGuard";
import { UNLOCK_COOKIE } from "@/lib/notulenUnlock";

export const dynamic = "force-dynamic";

const body = z.object({ password: z.string().min(1, "Masukkan kata sandi Anda.").max(200) });

/**
 * Buka kunci notulen dengan kata sandi pemilik akun. Berhasil: bukti berumur 60 menit dipasang di cookie (klien Bearer menerimanya
 * di respons untuk dikirim lewat header). Yang salah dibatasi (5 kali per 15 menit) dan hanya yang berhasil dicatat di log aktivitas.
 */
export const POST = handle(async (req: Request) => {
  const u = await requireUser(req);
  const b = body.parse(await req.json().catch(() => ({})));
  const { token, expiresAt } = await unlockWithPassword(u, b.password, req);
  await audit({ tenantId: u.tenantId, userId: u.userId, action: "meeting.notulen.unlock", entity: "User", entityId: u.userId });
  const bearer = req.headers.get("authorization")?.toLowerCase().startsWith("bearer ") ?? false;
  const res = NextResponse.json({ ok: true, expiresAt, ...(bearer ? { token } : {}) });
  res.cookies.set(UNLOCK_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    maxAge: Math.max(1, Math.floor((expiresAt - Date.now()) / 1000)),
  });
  return res;
});

/** Kunci kembali sekarang (mis. di perangkat bersama): bukti di cookie dihapus. */
export const DELETE = handle(async (req: Request) => {
  await requireUser(req);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(UNLOCK_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return res;
});
