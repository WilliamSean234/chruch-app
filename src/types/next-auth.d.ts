import type { AuthUser } from "@/lib/rbac";

declare module "next-auth" {
  interface Session {
    user: AuthUser & { email?: string | null };
  }
}

declare module "next-auth/jwt" {
  interface JWT extends Partial<AuthUser> {}
}
