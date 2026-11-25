import { sundayPair } from "./seatRules";

/**
 * Pilihan "Acara" di Log aktivitas. Murni (tanpa database) supaya mudah diuji.
 *
 * Ibadah Minggu I dan II di hari yang sama berpersonel sama, jadi keduanya selalu jadi satu pilihan: "Ibadah Minggu · 29 Nov 2026".
 * Memilihnya menampilkan catatan kedua ibadah. Di dalamnya, `parts` memisahkan tiap ibadah (dengan tanda `solo` bila ibadah itu pernah
 * diubah sendiri) supaya catatan satu ibadah bisa disaring. Nilai pilihan gabungan berupa dua id dipisah koma.
 */
export type EventIn = { id: string; startsAt: Date; templateName: string | null; title: string };
export type EventPart = { value: string; label: string; solo: boolean };
export type EventOption = { value: string; label: string; parts?: EventPart[] };

export function buildEventOptions(
  events: EventIn[],
  solo: Set<string>,
  fmt: { label: (e: EventIn) => string; part: (e: EventIn) => string; day: (e: EventIn) => string; dayKey: (e: EventIn) => string },
): EventOption[] {
  const items: { at: number; opt: EventOption }[] = [];
  const used = new Set<string>();

  const byDay = new Map<string, EventIn[]>();
  for (const e of events) {
    if (!e.templateName || !sundayPair(e.templateName)) continue;
    const k = fmt.dayKey(e);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  for (const list of byDay.values()) {
    const one = list.find((e) => sundayPair(e.templateName!)!.n === 1);
    const two = list.find((e) => sundayPair(e.templateName!)!.n === 2);
    if (!one || !two || sundayPair(one.templateName!)!.base !== sundayPair(two.templateName!)!.base) continue;
    used.add(one.id); used.add(two.id);
    const base = one.title.replace(/\s*[-–]?\s*(ii|i|2|1)$/i, "").trim() || one.title;
    items.push({
      at: Math.min(one.startsAt.getTime(), two.startsAt.getTime()),
      opt: {
        value: `${one.id},${two.id}`, label: `${base} · ${fmt.day(one)}`,
        parts: [one, two].map((e) => ({ value: e.id, label: fmt.part(e), solo: solo.has(e.id) })),
      },
    });
  }
  for (const e of events) if (!used.has(e.id)) items.push({ at: e.startsAt.getTime(), opt: { value: e.id, label: fmt.label(e) } });
  return items.sort((a, b) => b.at - a.at).map((x) => x.opt);
}

/** Id acara dari nilai pilihan (satu id, atau dua id dipisah koma). */
export const eventIdsOf = (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean);

/**
 * Catatan yang dihitung sebagai "diubah sendiri" pada satu acara: bukan hasil menyalin ke ibadah pasangannya.
 * Yang bukan perubahan isi acara (terbit, pemberitahuan, kehadiran) dan yang tidak bisa dibedakan (sesi latihan) tidak dihitung.
 */
const OWN_EDIT = new Set(["event.update", "event.seat.add", "event.seat.remove", "event.team.add", "event.team.remove", "event.cancel", "event.reopen", "assignment.set"]);
export function isOwnEdit(action: string, payload: unknown): boolean {
  if (!OWN_EDIT.has(action)) return false;
  if (action !== "assignment.set") return true;
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  return !(p.mirror === true || p.mirroredFrom); // ikut ibadah pasangan = bukan edit sendiri
}
