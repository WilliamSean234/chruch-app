type R = { id: string; name: string; floor?: number | null };

/** <option> ruangan dikelompokkan per lantai (dipakai di semua pilihan ruangan). Tanpa data lantai → daftar biasa. */
export default function RoomOptions({ rooms, disabledIds }: { rooms: R[]; disabledIds?: Set<string> }) {
  const opt = (r: R) => <option key={r.id} value={r.id} disabled={disabledIds?.has(r.id)}>{r.name}</option>;
  const floors = [...new Set(rooms.map((r) => r.floor ?? null))].sort((a, b) => (a === null ? 1 : b === null ? -1 : a - b));
  if (floors.every((f) => f === null)) return <>{rooms.map(opt)}</>;
  return (
    <>
      {floors.map((f) => (
        <optgroup key={String(f)} label={f === null ? "Lantai belum diisi" : `Lantai ${f}`}>{rooms.filter((r) => (r.floor ?? null) === f).map(opt)}</optgroup>
      ))}
    </>
  );
}
