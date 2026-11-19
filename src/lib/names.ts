const TITLES = ["pdt", "pdm", "pdp", "ps", "pt", "dr", "drs", "ir", "bpk", "bapak", "ibu", "kak", "ko", "cik", "sdr", "sdri", "mr", "mrs"];

/** Kunci pembanding nama: huruf kecil, tanpa gelar dan tanda baca, spasi dirapikan. Cegah orang dobel. */
export function nameKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && TITLES.includes(words[0])) words.shift();
  return words.join(" ");
}

/** Usia penuh pada hari ini menurut zona waktu gereja; null bila tanggal lahir kosong. */
export function ageFrom(birthDate: Date | null, now = new Date(), tz = process.env.APP_TIMEZONE ?? "Asia/Jakarta"): number | null {
  if (!birthDate) return null;
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  const [y, m, d] = p;
  let age = y - birthDate.getUTCFullYear();
  const bm = birthDate.getUTCMonth() + 1;
  if (m < bm || (m === bm && d < birthDate.getUTCDate())) age--;
  return age;
}
