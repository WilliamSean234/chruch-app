"use client";

/** Kartu info acara online: pembicara, penerima tautan, dan tombol bergabung (hanya bila tautan boleh dilihat). */
export type OnlineDto = {
  isOnline: boolean; url: string | null; canSeeLink?: boolean;
  speaker: { personId: string | null; name: string } | null;
  communities?: { id: string; name: string }[]; visibleTo?: string; theme?: string | null; reminder?: boolean;
};

export default function OnlineInfo({ online, showTheme }: { online: OnlineDto | null | undefined; showTheme?: boolean }) {
  if (!online?.isOnline) return null;
  const restricted = online.visibleTo === "COMMUNITIES";
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-[var(--primary-soft)] px-3 py-2.5">
      <span className="self-start whitespace-nowrap rounded-full bg-white px-2.5 py-[3px] text-xs font-bold text-[var(--primary-ink)]">Online</span>
      {showTheme && online.theme && <div className="flex flex-col gap-0.5"><span className="text-[11.5px] font-semibold text-[var(--ink-2)]">Tema</span><span className="whitespace-pre-line break-words text-sm font-bold">{online.theme}</span></div>}
      {online.speaker && <div className="flex flex-col gap-0.5"><span className="text-[11.5px] font-semibold text-[var(--ink-2)]">Pembicara</span><span className="break-words text-sm font-bold">{online.speaker.name}</span></div>}
      {online.url ? (
        <a href={online.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-white no-underline">Gabung meeting online</a>
      ) : restricted && online.communities?.length ? (
        <span className="text-xs font-medium text-[var(--ink-2)]">Tautan hanya untuk komunitas {online.communities.map((c) => c.name).join(", ")}.</span>
      ) : (
        <span className="text-xs font-medium text-[var(--ink-2)]">Tautan tidak tersedia untuk Anda.</span>
      )}
      {online.url && restricted && online.communities?.length ? <span className="text-xs font-medium text-[var(--ink-2)]">Tautan hanya untuk komunitas {online.communities.map((c) => c.name).join(", ")}.</span> : null}
    </div>
  );
}
