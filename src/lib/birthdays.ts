/**
 * Ulang tahun jemaat untuk kalender dan notifikasi. Murni (tanpa database) supaya mudah diuji.
 * Yang dipakai hanya tanggal dan bulan lahir; tahun lahir (usia) tidak pernah dikirim ke tampilan lain.
 */
export type BirthdayPerson = { id: string; name: string; nickname: string | null; birthDate: Date };
export type Birthday = { date: string; personId: string; name: string };

const pad = (n: number) => String(n).padStart(2, "0");
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Nama yang tampil: nama panggilan bila ada. */
export const birthdayName = (p: { name: string; nickname: string | null }) => p.nickname?.trim() || p.name;

/** Tanggal ulang tahun di tahun `year` ("YYYY-MM-DD"). Yang lahir 29 Februari dirayakan 28 Februari di tahun biasa. */
export function birthdayInYear(birth: Date, year: number): string {
  const m = birth.getUTCMonth() + 1;
  let d = birth.getUTCDate();
  if (m === 2 && d === 29 && !isLeap(year)) d = 28;
  return `${year}-${pad(m)}-${pad(d)}`;
}

/** Ulang tahun yang jatuh pada rentang `from`..`to` (keduanya "YYYY-MM-DD", boleh melewati pergantian tahun), urut tanggal lalu nama. */
export function birthdaysInRange(people: BirthdayPerson[], from: string, to: string): Birthday[] {
  const y0 = Number(from.slice(0, 4)), y1 = Number(to.slice(0, 4));
  const out: Birthday[] = [];
  for (const p of people) {
    for (let y = y0; y <= y1; y++) {
      const date = birthdayInYear(p.birthDate, y);
      if (date >= from && date <= to) out.push({ date, personId: p.id, name: birthdayName(p) });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "id"));
}

export const birthdaysOn = (people: BirthdayPerson[], ymd: string): Birthday[] => birthdaysInRange(people, ymd, ymd);

/** Judul dan isi pesan notifikasi untuk daftar nama yang berulang tahun hari ini (tidak kosong). */
export function birthdayMessage(names: string[]): { title: string; body: string } {
  if (names.length === 1) return { title: "Ada yang berulang tahun", body: `Hari ini ${names[0]} berulang tahun.` };
  const shown = names.length <= 4 ? names.join(", ") : `${names.slice(0, 4).join(", ")}, +${names.length - 4} lainnya`;
  return { title: `${names.length} orang berulang tahun`, body: `Hari ini yang berulang tahun: ${shown}.` };
}
