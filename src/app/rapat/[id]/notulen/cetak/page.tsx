import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/components/AppShell";
import PrintToolbar from "@/components/meetings/PrintButton";
import { getMeeting } from "@/lib/meetings";
import { getMinutes } from "@/lib/meetingMinutes";
import { getChurchProfile } from "@/lib/church";
import { unlockExpiry } from "@/lib/notulenGuard";
import { ApiError } from "@/lib/errors";
import { dayLong, hm } from "@/lib/ui";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> };

const stamp = (iso: string) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso)).replace(".", ":");

function Block({ title, text }: { title: string; text: string }) {
  return (
    <section className="break-inside-avoid-page">
      <h2 className="m-0 border-b border-[#171a2c] pb-1 text-[13px] font-extrabold tracking-[0.08em]">{title}</h2>
      {text.trim()
        ? <p className="m-0 mt-2.5 whitespace-pre-wrap text-[14px] leading-[1.7]">{text}</p>
        : <p className="m-0 mt-2.5 text-[14px] italic text-[#565B76]">Tidak ada.</p>}
    </section>
  );
}

/** Lembar cetak notulen Final. Hanya anggota kelompok; yang dicetak selalu versi Final (terakhir, atau versi tertentu lewat ?v=). */
export default async function NotulenCetakPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { v } = await searchParams;
  const u = await currentUser();
  const nf = (e: unknown) => { if (e instanceof ApiError && e.status === 404) notFound(); throw e; };
  const m = await getMeeting(u, id).catch(nf);
  if (m.locked) redirect(`/rapat/${id}`);
  if ((await unlockExpiry(u)) === null) redirect(`/rapat/${id}/notulen`); // terkunci: halaman notulen meminta kata sandi
  const minutes = await getMinutes(u, id).catch(nf);

  const want = v ? Number(v) : null;
  const rev = want ? minutes.revisions.find((r) => r.version === want) : minutes.revisions[0]; // urutan menurun: [0] = Final terbaru
  if (!rev) redirect(`/rapat/${id}/notulen`);

  const church = await getChurchProfile(u.tenantId);
  const members = m.participants.filter((p) => !p.isGuest);
  const names = (st: string) => members.filter((p) => p.status === st).map((p) => p.name);
  const guests = m.participants.filter((p) => p.isGuest).map((p) => p.name);
  const att = m.attendance;
  const rows: [string, string][] = [
    ["Kelompok", m.group.name],
    ["Topik", m.title ?? m.displayTitle],
    ["Hari, tanggal", dayLong(m.startsAt)],
    ["Waktu", `${hm(m.startsAt)}–${hm(m.endsAt)} WIB`],
    ["Tempat", m.room.name],
    ["Nomor rapat", m.number],
  ];
  const attRows: [string, string][] = [
    ["Hadir", names("PRESENT").join(", ")], ["Izin", names("EXCUSED").join(", ")], ["Tidak hadir", names("ABSENT").join(", ")],
    ["Belum dicatat", names("INVITED").join(", ")], ["Tamu", guests.join(", ")],
  ];

  return (
    <div className="min-h-screen bg-[#e9ebf3] print:bg-white">
      <style>{`@page { size: A4; margin: 18mm 16mm; } @media print { html, body { background: #fff !important; } }`}</style>
      <PrintToolbar backHref={`/rapat/${id}/notulen`} version={rev.version} />
      <main className="mx-auto my-6 max-w-[860px] bg-white px-14 py-12 text-[#171a2c] shadow-[0_8px_30px_-12px_rgba(30,34,90,0.25)] print:m-0 print:max-w-none print:p-0 print:shadow-none">
        <header className="flex flex-col gap-1 border-b-2 border-[#171a2c] pb-4 text-center">
          <span className="text-[16px] font-extrabold">{church.name}</span>
          {(church.address || church.phone) && <span className="text-[12px] font-medium text-[#565B76]">{[church.address, church.phone].filter(Boolean).join(" · ")}</span>}
          <span className="mt-2 text-[12px] font-bold tracking-[0.14em] text-[#565B76]">NOTULEN RAPAT</span>
          <h1 className="m-0 text-[24px] font-extrabold uppercase tracking-wide">{m.group.name}</h1>
          <span className="text-[13px] font-semibold text-[#565B76]">Versi {rev.version} · Final</span>
        </header>

        <table className="mt-5 w-full border-collapse text-[13.5px]">
          <tbody>
            {rows.map(([k, val]) => (
              <tr key={k} className="align-top"><td className="w-[150px] py-1 pr-3 font-semibold text-[#565B76]">{k}</td><td className="w-3 py-1">:</td><td className="py-1 font-bold">{val}</td></tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex flex-col gap-6">
          <section className="break-inside-avoid-page">
            <h2 className="m-0 border-b border-[#171a2c] pb-1 text-[13px] font-extrabold tracking-[0.08em]">DAFTAR HADIR</h2>
            {att ? (
              <>
                <p className="m-0 mt-2.5 text-[13.5px] font-bold">
                  {att.present} dari {att.invited} anggota hadir ({att.percent}%)
                  {att.quorumMin != null && att.quorumMet != null ? ` · ${att.quorumMet ? `kuorum ${att.quorumMin}% terpenuhi, rapat sah` : `belum memenuhi kuorum ${att.quorumMin}%`}` : ""}
                </p>
                <table className="mt-1.5 w-full border-collapse text-[13px]">
                  <tbody>
                    {attRows.filter(([, val]) => val).map(([k, val]) => (
                      <tr key={k} className="align-top"><td className="w-[110px] py-0.5 pr-3 font-semibold text-[#565B76]">{k}</td><td className="w-3 py-0.5">:</td><td className="py-0.5">{val}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <p className="m-0 mt-2.5 text-[14px] italic text-[#565B76]">Kehadiran tidak dicatat.</p>}
          </section>

          <Block title="AGENDA" text={rev.agenda} />
          <Block title="PEMBAHASAN DAN TINDAK LANJUT" text={rev.discussion} />
          <Block title="KEPUTUSAN" text={rev.decisions} />
        </div>

        <footer className="mt-10 flex flex-col gap-1 border-t border-[#c8cbdc] pt-3 text-[12px] font-medium text-[#565B76]">
          <span>Difinalkan{rev.finalizedBy ? ` oleh ${rev.finalizedBy}` : ""} pada {stamp(rev.finalizedAt)} WIB.{rev.reason ? ` Alasan revisi: ${rev.reason}.` : ""}</span>
          <span>Dokumen ini tertutup dan hanya untuk anggota {m.group.name}. Dicetak dari {church.name}.</span>
        </footer>
      </main>
    </div>
  );
}
