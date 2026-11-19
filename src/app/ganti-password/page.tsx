import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ChangePasswordForm from "./ChangePasswordForm";

export default async function GantiPasswordPage() {
  const s = await auth();
  const u = s?.user;
  if (!u?.userId) redirect("/login");
  return <ChangePasswordForm email={u.email ?? ""} forced={!!u.mustChangePassword} />;
}
