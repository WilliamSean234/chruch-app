import { decode } from "next-auth/jwt";
import { auth, SESSION_SALT } from "./auth";
import { ApiError, unauthorized } from "./errors";
import type { AuthUser } from "./rbac";

/**
 * Ambil user dari request: header `Authorization: Bearer <jwt>` (aplikasi native)
 * atau cookie sesi NextAuth (web). Selalu melempar 401 bila tidak ada.
 */
export async function requireUser(req?: Request, opts?: { allowMustChange?: boolean }): Promise<AuthUser> {
  const u = await readUser(req);
  if (u.mustChangePassword && !opts?.allowMustChange) {
    throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "Anda harus mengganti kata sandi awal terlebih dahulu.");
  }
  return u;
}

async function readUser(req?: Request): Promise<AuthUser> {
  const header = req?.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET belum diisi");
    const payload = await decode({ token, secret, salt: SESSION_SALT }).catch(() => null);
    if (!payload?.userId || !payload.tenantId) throw unauthorized();
    return {
      userId: payload.userId,
      tenantId: payload.tenantId,
      personId: payload.personId ?? null,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
      mustChangePassword: payload.mustChangePassword ?? false,
    };
  }
  const session = await auth();
  const u = session?.user;
  if (!u?.userId || !u.tenantId) throw unauthorized();
  return { userId: u.userId, tenantId: u.tenantId, personId: u.personId ?? null, roles: u.roles, permissions: u.permissions, mustChangePassword: u.mustChangePassword ?? false };
}
