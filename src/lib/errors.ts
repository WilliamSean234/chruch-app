import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = () => new ApiError(401, "UNAUTHORIZED", "Silakan login terlebih dahulu.");
export const forbidden = (msg = "Anda tidak punya akses untuk aksi ini.") => new ApiError(403, "FORBIDDEN", msg);
export const notFound = (what = "Data") => new ApiError(404, "NOT_FOUND", `${what} tidak ditemukan.`);
export const conflict = (msg: string, details?: unknown) => new ApiError(409, "CONFLICT", msg, details);
export const badRequest = (msg: string, details?: unknown) => new ApiError(400, "BAD_REQUEST", msg, details);

/** Bungkus route handler: ubah error apa pun menjadi JSON yang rapi. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    const t0 = Date.now();
    const req = args[0] instanceof Request ? args[0] : undefined;
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
      }
      if (e instanceof ZodError) {
        return NextResponse.json(
          { error: { code: "VALIDATION", message: "Data tidak valid.", details: e.issues } },
          { status: 422 },
        );
      }
      console.error(e);
      return NextResponse.json({ error: { code: "INTERNAL", message: "Terjadi kesalahan di server." } }, { status: 500 });
    } finally {
      // Penanda API lambat: aktif di mode dev, atau di produksi bila LOG_SLOW_MS diisi (ms).
      const limit = Number(process.env.LOG_SLOW_MS ?? (process.env.NODE_ENV === "production" ? 0 : 500));
      const took = Date.now() - t0;
      if (limit > 0 && req && took >= limit) console.warn(`[lambat] ${req.method} ${new URL(req.url).pathname} ${took} ms`);
    }
  };
}
