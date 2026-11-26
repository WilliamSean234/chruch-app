import { sundayBaseTitle } from "./rehearsalRules";

/** Acara yang memakai satu sesi latihan (Ibadah Minggu 1 dan 2 berbagi latihan yang sama). */
export type RehearsalEvent = { id: string; title: string; startsAt: string; endsAt: string; status: string };

type Row = {
  key: string; kind: "SERVICE" | "REHEARSAL" | "MEETING" | "COMMUNITY"; eventId: string; title: string; startsAt: string; endsAt: string; room: string; status: string; note?: string;
  events?: RehearsalEvent[];
};

/**
 * Jadwal saya: latihan Ibadah Minggu 1 dan 2 (jam dan ruangan sama) hanya tampil satu baris, berjudul "Latihan Ibadah Minggu",
 * dan mengingat kedua acaranya (`events`). Baris ibadah dan latihan yang tidak kembar tidak berubah. Urutan asli dipertahankan.
 */
export function mergeTwinRehearsalRows<T extends Row>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    if (r.kind !== "REHEARSAL") continue;
    const k = `${r.startsAt}|${r.endsAt}|${r.room}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const done = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (r.kind !== "REHEARSAL") { out.push(r); continue; }
    const k = `${r.startsAt}|${r.endsAt}|${r.room}`;
    if (done.has(k)) continue;
    done.add(k);
    const group = groups.get(k)!;
    if (group.length === 1) { out.push(r); continue; }
    const events = [...new Map(group.flatMap((g) => g.events ?? [{ id: g.eventId, title: g.title, startsAt: g.startsAt, endsAt: g.endsAt, status: g.status }]).map((e) => [e.id, e])).values()]
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const bases = new Set(events.map((e) => sundayBaseTitle(e.title)));
    const title = bases.size === 1 ? `Latihan ${[...bases][0]}` : `Latihan ${events.map((e) => e.title).join(" & ")}`;
    const status = group.every((g) => g.status === "DRAFT") ? "DRAFT" : group.find((g) => g.status !== "DRAFT")!.status;
    out.push({ ...group[0]!, title, status, events, note: group.find((g) => g.note)?.note });
  }
  return out;
}
