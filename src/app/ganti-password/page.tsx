import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { liveUser } from "@/lib/liveUser";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function GantiPasswordPage() {
  const s = await auth();
  const c = s?.user;
  if (!c?.userId || !c.tenantId) redirect("/login");
  const u = await liveUser({ userId: c.userId, tenantId: c.tenantId, personId: c.personId ?? null, roles: c.roles, permissions: c.permissions, authAt: c.authAt });
  if (!u) redirect("/login");
  return <ChangePasswordForm email={c.email ?? ""} forced={u.mustChangePassword === true} />;
}
