/**
 * Aturan murni untuk latihan ibadah (tanpa database, jadi mudah diuji):
 * - latihan harus dimulai sebelum acara dimulai (bila ada Ibadah Minggu 1 dan 2 di hari yang sama: sebelum yang paling awal),
 * - latihan Ibadah Minggu 1 dan 2 di hari yang sama adalah satu latihan yang sama ("kembar": jam dan ruangan sama).
 */

type Slot = { startsAt: Date; endsAt: Date; roomId: string };

/** Batas akhir mulai latihan: awal acara; bila ada acara pasangan di hari yang sama, awal yang paling dulu. */
export function rehearsalLimit(eventStart: Date, pairStart?: Date | null): Date {
  return pairStart && pairStart.getTime() < eventStart.getTime() ? pairStart : eventStart;
}

/** Pesan galat bila latihan dimulai pada atau sesudah batas; null bila boleh. `label` = teks batas, mis. "Min, 20 Des 07.30". */
export function rehearsalTimingError(startsAt: Date, limit: Date, label: string): string | null {
  return startsAt.getTime() < limit.getTime() ? null : `Latihan harus dimulai sebelum ibadah (${label}). Pilih tanggal atau jam yang lebih awal.`;
}

/** Dua sesi dianggap latihan yang sama bila jam mulai, jam selesai, dan ruangannya sama. */
export const isTwinSlot = (a: Slot, b: Slot) => a.startsAt.getTime() === b.startsAt.getTime() && a.endsAt.getTime() === b.endsAt.getTime() && a.roomId === b.roomId;

/** "Ibadah Minggu II" → "Ibadah Minggu". Judul lain tidak diubah. */
export const sundayBaseTitle = (title: string) => title.replace(/(\s+|\s*[-–]\s*)(ii|i|2|1)\s*$/i, "").trim() || title;

type CalRow = { startsAt: string; endsAt: string; room: { id: string }; eventTitle: string; mine: boolean };
/**
 * Di kalender, latihan kembar (Ibadah Minggu 1 dan 2, jam dan ruangan sama) tampil satu kali dengan judul "Ibadah Minggu".
 * Tanda "milik saya" berlaku bila salah satunya milik pengguna. Urutan asli dipertahankan.
 */
export function dedupeTwinRehearsals<T extends CalRow>(rows: T[]): T[] {
  const byKey = new Map<string, T[]>();
  for (const r of rows) {
    const k = `${r.startsAt}|${r.endsAt}|${r.room.id}`;
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  const done = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = `${r.startsAt}|${r.endsAt}|${r.room.id}`;
    if (done.has(k)) continue;
    done.add(k);
    const group = byKey.get(k)!;
    if (group.length === 1) { out.push(r); continue; }
    const base = sundayBaseTitle(group[0]!.eventTitle);
    const sameBase = group.every((g) => sundayBaseTitle(g.eventTitle) === base);
    out.push({ ...group[0]!, ...(sameBase ? { eventTitle: base } : {}), mine: group.some((g) => g.mine) });
  }
  return out;
}
