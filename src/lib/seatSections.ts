/** Susunan petugas untuk ditampilkan: per tim, hanya kursi yang sudah ada orangnya; tim tanpa orang disembunyikan. */
export type SeatLite = { id: string; teamTypeId: string; label: string; ministryName: string; rehearsalRequired: boolean; person: { id: string; name: string; origin: string; originChurch: string | null } | null };
export type TeamLite = { teamTypeId: string; name: string };

export function seatSections(teams: TeamLite[], seats: SeatLite[], onlyRehearsal = false) {
  return teams
    .map((t) => ({ title: t.name, seats: seats.filter((s) => s.teamTypeId === t.teamTypeId && s.person && (!onlyRehearsal || s.rehearsalRequired)) }))
    .filter((x) => x.seats.length > 0);
}

/** Kunci pengelompokan daftar jadwal per bulan: "2026-11" -> "NOVEMBER 2026". */
export function monthHeading(ymd: string, months: readonly string[]): string {
  return `${months[Number(ymd.slice(5, 7)) - 1] ?? ""} ${ymd.slice(0, 4)}`.trim().toUpperCase();
}
