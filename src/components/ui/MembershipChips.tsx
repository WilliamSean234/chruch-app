export type Membership = { groupId: string; groupName: string; positions: string[] };

/** Kelompok dan jabatan seseorang di tiap kelompok, mis. "Majelis · Ketua". Satu chip per kelompok. */
export default function MembershipChips({ items }: { items?: Membership[] }) {
  if (!items || items.length === 0) return <span className="text-[var(--ink-2)]">–</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((m) => (
        <span key={m.groupId} className="inline-block max-w-full truncate rounded-full bg-[var(--gold-soft)] px-2.5 py-0.5 text-xs font-bold text-[#6F4304]" title={`${m.groupName}${m.positions.length ? ` — ${m.positions.join(", ")}` : ""}`}>
          {m.groupName}{m.positions.length > 0 && <span className="font-semibold"> · {m.positions.join(", ")}</span>}
        </span>
      ))}
    </span>
  );
}
