/**
 * Pemeriksaan aturan penjadwalan pada acara yang sudah terisi. Murni (tanpa database) supaya mudah diuji.
 * Aturan yang sama dengan yang dijaga saat mengisi kursi (seatRules), dipakai ulang untuk mencari acara yang
 * sudah telanjur menyimpang, mis. karena diunggah dari Excel, diisi dengan override, atau aturannya baru dibuat.
 */
import { isOutsideEbmSeat, judgePair, teamKind } from "./seatRules";

export type RuleCode = "EBM_LUAR" | "EBM_RANGKAP" | "KURSI_EBM" | "NO_BAND" | "BENTROK" | "BELUM_BISA";
export type Severity = "ATURAN" | "PERINGATAN";

/** Daftar aturan yang diperiksa, urut sesuai tampilan. ATURAN = melanggar yang sudah ditentukan; PERINGATAN = patut dicek. */
export const RULES: { code: RuleCode; label: string; severity: Severity; hint: string }[] = [
  { code: "EBM_LUAR", label: "Anggota EBM lebih dari 1 di luar EBM", severity: "ATURAN", hint: "Hanya 1 anggota EBM yang boleh bertugas sebagai pemusik, pimpinan ibadah, atau usher." },
  { code: "EBM_RANGKAP", label: "EBM merangkap Usher atau pemusik", severity: "ATURAN", hint: "Orang yang bertugas di EBM tidak boleh merangkap Usher atau tim pemusik." },
  { code: "KURSI_EBM", label: "Kursi EBM diisi bukan anggota EBM", severity: "ATURAN", hint: "Kursi tim EBM hanya untuk anggota EBM." },
  { code: "NO_BAND", label: "Ibadah No Band masih ada posisi band", severity: "ATURAN", hint: "Ibadah No Band tidak memakai posisi band." },
  { code: "BENTROK", label: "Orang terjadwal di dua tempat sekaligus", severity: "ATURAN", hint: "Satu orang tidak boleh ada di dua acara atau latihan pada jam yang sama." },
  { code: "BELUM_BISA", label: "Belum tercatat bisa posisinya", severity: "PERINGATAN", hint: "Orang ini belum dicatat bisa posisi yang diisi." },
];
export const RULE_BY_CODE = new Map(RULES.map((r) => [r.code, r]));

export type RuleSeat = {
  personId: string | null; personName: string | null;
  ministryId: string; ministryName: string; teamTypeId: string; teamName: string; bandOnly: boolean;
};
export type RuleEvent = { bandMode: "BAND" | "NO_BAND"; seats: RuleSeat[] };
export type RuleContext = {
  /** Orang yang punya pelayanan di tim EBM. */
  ebm: Set<string>;
  /** Kemampuan tercatat, berbentuk `${personId}:${ministryId}`. */
  capable: Set<string>;
};
export type Violation = { code: RuleCode; severity: Severity; message: string; teamTypeIds: string[] };

const v = (code: RuleCode, message: string, seats: RuleSeat[]): Violation => ({
  code, severity: RULE_BY_CODE.get(code)!.severity, message, teamTypeIds: [...new Set(seats.map((s) => s.teamTypeId))],
});

/** Semua penyimpangan aturan di satu acara, selain bentrok jadwal (BENTROK) yang butuh data pemakaian waktu. */
export function checkEvent(e: RuleEvent, ctx: RuleContext): Violation[] {
  const out: Violation[] = [];
  const filled = e.seats.filter((s): s is RuleSeat & { personId: string; personName: string } => !!s.personId && !!s.personName);

  // 1. lebih dari satu anggota EBM bertugas di luar EBM
  const outside = filled.filter((s) => ctx.ebm.has(s.personId) && isOutsideEbmSeat(s.teamName));
  const people = new Map<string, string>();
  for (const s of outside) people.set(s.personId, s.personName);
  if (people.size > 1) {
    const list = [...people.keys()].map((id) => {
      const mine = outside.filter((s) => s.personId === id);
      return `${people.get(id)} (${mine.map((s) => s.ministryName).join(", ")})`;
    });
    out.push(v("EBM_LUAR", `Ada ${people.size} anggota EBM yang bertugas di luar EBM: ${list.join("; ")}. Seharusnya hanya 1.`, outside));
  }

  // 2. satu orang memegang kursi EBM sekaligus Usher atau pemusik
  const byPerson = new Map<string, typeof filled>();
  for (const s of filled) byPerson.set(s.personId, [...(byPerson.get(s.personId) ?? []), s]);
  for (const seats of byPerson.values()) {
    for (let i = 0; i < seats.length; i++) {
      for (let j = i + 1; j < seats.length; j++) {
        const a = seats[i]!, b = seats[j]!;
        const r = judgePair({ teamName: a.teamName, ministryName: a.ministryName }, { teamName: b.teamName, ministryName: b.ministryName }, a.personName);
        if (r.kind === "BLOCKED") out.push(v("EBM_RANGKAP", r.message, [a, b]));
      }
    }
  }

  // 3. kursi EBM diisi orang yang bukan anggota EBM
  for (const s of filled) {
    if (teamKind(s.teamName) === "EBM" && !ctx.ebm.has(s.personId)) out.push(v("KURSI_EBM", `${s.personName} mengisi ${s.ministryName} (${s.teamName}) tetapi belum tercatat sebagai anggota EBM.`, [s]));
  }

  // 4. ibadah No Band tetapi posisi band masih berorang
  if (e.bandMode === "NO_BAND") {
    for (const s of filled) if (s.bandOnly) out.push(v("NO_BAND", `Ibadah ini No Band, tetapi ${s.ministryName} masih diisi ${s.personName}.`, [s]));
  }

  // 5. orang belum tercatat bisa posisinya
  for (const s of filled) {
    if (!ctx.capable.has(`${s.personId}:${s.ministryId}`)) out.push(v("BELUM_BISA", `${s.personName} belum tercatat bisa ${s.ministryName}.`, [s]));
  }
  return out;
}

export type TimedBooking = { id: string; personId: string; startsAt: Date; endsAt: Date; kind: "EVENT" | "REHEARSAL"; eventId: string };

/**
 * Pasangan pemakaian waktu satu orang yang bertumpuk. Dilewati: pemakaian di acara yang sama (merangkap yang dibolehkan,
 * atau kursi dengan latihan acaranya sendiri) dan latihan Ibadah Minggu 1 dan 2 yang waktunya persis sama (satu latihan "kembar").
 */
export function overlappingBookings(rows: TimedBooking[]): [TimedBooking, TimedBooking][] {
  const byPerson = new Map<string, TimedBooking[]>();
  for (const r of rows) byPerson.set(r.personId, [...(byPerson.get(r.personId) ?? []), r]);
  const out: [TimedBooking, TimedBooking][] = [];
  for (const list of byPerson.values()) {
    list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j]!.startsAt < list[i]!.endsAt; j++) {
        const a = list[i]!, b = list[j]!;
        if (a.eventId === b.eventId) continue;
        const twin = a.kind === "REHEARSAL" && b.kind === "REHEARSAL" && a.startsAt.getTime() === b.startsAt.getTime() && a.endsAt.getTime() === b.endsAt.getTime();
        if (!twin) out.push([a, b]);
      }
    }
  }
  return out;
}
