"use server";

import { auth, signOut } from "./auth";
import { leave } from "./presence";

/** Keluar: akun langsung offline (bukan menunggu 40 detik), lalu sesi diakhiri. Dipakai tombol "Keluar" di semua halaman. */
export async function logoutAction() {
  const s = await auth().catch(() => null);
  if (s?.user?.userId) await leave(s.user.userId).catch(() => undefined);
  await signOut({ redirectTo: "/login" });
}
