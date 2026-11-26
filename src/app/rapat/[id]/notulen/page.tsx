import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AppShell, { currentUser } from "@/components/AppShell";
import MeetingMinutes from "@/components/meetings/MeetingMinutes";
import { NotulenGate, NotulenLockBar } from "@/components/meetings/NotulenUnlock";
import { getMeeting } from "@/lib/meetings";
import { getMinutes } from "@/lib/meetingMinutes";
import { getChurchProfile } from "@/lib/church";
import { unlockExpiry } from "@/lib/notulenGuard";
import { ApiError } from "@/lib/errors";

type Props = { params: Promise<{ id: string }> };

/** Notulen rapat. Hanya anggota kelompok (yang lain dikembalikan ke halaman rapat), dan baru terbuka setelah kata sandi dimasukkan ulang. */
export default async function NotulenPage({ params }: Props) {
  const { id } = await params;
  const u = await currentUser();
  const notFoundTo = (e: unknown) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; };
  const m = await getMeeting(u, id).catch(notFoundTo);
  if (m.locked || !m.fullMeeting) redirect(`/rapat/${id}`); // bukan anggota, atau rapat "hanya jadwal" (tanpa notulen)
  const shell = { active: "rapat" as const, title: m.displayTitle, subtitle: `Notulen · ${m.group.name} · ${m.number}` };
  // isi notulen baru dibaca (dan didekripsi) setelah kata sandi dimasukkan ulang
  const until = await unlockExpiry(u);
  if (until === null) return <AppShell {...shell}><NotulenGate backHref={`/rapat/${id}`} /></AppShell>;
  let minutes: Awaited<ReturnType<typeof getMinutes>>;
  try {
    minutes = await getMinutes(u, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    // galat yang dikenal (mis. kunci enkripsi di server) ditampilkan apa adanya, bukan halaman "server error" yang kosong
    if (e instanceof ApiError) {
      console.error("[notulen] gagal membuka isi notulen:", e.code, e.message);
      return (
        <AppShell {...shell}>
          <div role="alert" className="mx-auto flex w-full max-w-[560px] flex-col gap-3 rounded-[20px] border border-[#F3C9C9] bg-[#FFF5F5] p-6">
            <h2 className="m-0 text-lg font-extrabold text-[#9B1C1C]">Notulen belum bisa dibuka</h2>
            <p className="m-0 text-[13.5px] font-medium leading-relaxed text-[var(--ink-2)]">{e.message}</p>
            <Link href={`/rapat/${id}`} className="self-start text-[13px] font-bold text-[var(--primary-ink)] hover:underline">← Kembali ke rapat</Link>
          </div>
        </AppShell>
      );
    }
    throw e;
  }
  return (
    <AppShell {...shell}>
      <NotulenLockBar until={until} />
      <MeetingMinutes meeting={m} minutes={minutes} churchName={(await getChurchProfile(u.tenantId)).name} />
    </AppShell>
  );
}
