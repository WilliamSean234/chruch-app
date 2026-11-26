import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma";
import type { AuthUser } from "./rbac";
import { assertNotLocked, clearFailures, LoginLocked, recordFailure } from "./loginThrottle";
import { clientIp } from "./throttle";
import { checkSecondFactor, TwoFactorInvalid, TwoFactorRequired } from "./twoFactor";

const credsSchema = z.object({ email: z.string().email(), password: z.string().min(1), code: z.string().max(40).optional() }); // code: kode 2 langkah (hanya akun yang memakainya)

/** Verifikasi email+password dan susun isi JWT. Dipakai login web dan token native. */
export async function authorizeCredentials(raw: unknown, ip = "unknown"): Promise<(AuthUser & { email: string }) | null> {
  const parsed = credsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const email = parsed.data.email.trim().toLowerCase();
  await assertNotLocked(email, ip); // dilempar LoginLocked bila terlalu banyak percobaan salah

  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null, isActive: true },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } },
  });
  // Email yang tidak ada dihitung sama dengan sandi salah, supaya tidak bisa dipakai menebak akun mana yang ada.
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    await recordFailure(email, ip);
    return null;
  }
  if (user.totpEnabledAt) {
    // Kata sandi benar, tetapi akun ini memakai verifikasi 2 langkah: butuh kode dari aplikasi autentikator (atau kode cadangan).
    const code = parsed.data.code?.trim();
    if (!code) throw new TwoFactorRequired();
    if (!(await checkSecondFactor(user, code))) {
      await recordFailure(email, ip); // kode salah dihitung seperti sandi salah: dibatasi dan bisa terkunci sementara
      throw new TwoFactorInvalid();
    }
  }
  await clearFailures(email, ip);

  const permissions = new Set<string>();
  for (const ur of user.roles) for (const rp of ur.role.permissions) permissions.add(rp.permission.code);

  return {
    userId: user.id,
    tenantId: user.tenantId,
    personId: user.personId,
    email: user.email,
    roles: user.roles.map((ur) => ({ code: ur.role.code, isSuperadmin: ur.role.isSuperadmin, teamTypeId: ur.teamTypeId })),
    permissions: [...permissions],
    mustChangePassword: user.mustChangePassword,
  };
}

/** Kode kesalahan untuk halaman login: "locked.<menit>". */
class LockedSignin extends CredentialsSignin {
  constructor(minutes: number) {
    super();
    this.code = `locked.${minutes}`;
  }
}

/** Kode kesalahan untuk halaman login: butuh kode 2 langkah. */
class TwoFactorRequiredSignin extends CredentialsSignin {
  constructor() {
    super();
    this.code = "2fa_required";
  }
}
class TwoFactorInvalidSignin extends CredentialsSignin {
  constructor() {
    super();
    this.code = "2fa_invalid";
  }
}

export const SESSION_SALT = "authjs.session-token";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 hari

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, code: {} },
      authorize: async (c, request) => {
        try {
          const u = await authorizeCredentials(c, clientIp(request.headers));
          return u ? ({ id: u.userId, email: u.email, auth: u } as unknown as { id: string }) : null;
        } catch (e) {
          if (e instanceof LoginLocked) throw new LockedSignin(e.minutes);
          if (e instanceof TwoFactorRequired) throw new TwoFactorRequiredSignin();
          if (e instanceof TwoFactorInvalid) throw new TwoFactorInvalidSignin();
          throw e;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      const u = (user as { auth?: AuthUser } | undefined)?.auth;
      if (u) Object.assign(token, u, { authAt: Date.now() }); // authAt: kapan sesi dibuat, untuk mencabut sesi lama saat kata sandi diganti
      return token;
    },
    session({ session, token }) {
      Object.assign(session.user, {
        userId: token.userId,
        tenantId: token.tenantId,
        personId: token.personId ?? null,
        roles: token.roles ?? [],
        permissions: token.permissions ?? [],
        mustChangePassword: token.mustChangePassword ?? false,
        authAt: token.authAt,
      });
      return session;
    },
  },
});
