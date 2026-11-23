import { NextResponse } from "next/server";

/** Cron Vercel mengirim `Authorization: Bearer <CRON_SECRET>` bila variabel CRON_SECRET diisi. Tanpa rahasia, endpoint menolak semua. */
export function cronGuard(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET belum diisi di server." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Tidak diizinkan." }, { status: 401 });
  return null;
}
