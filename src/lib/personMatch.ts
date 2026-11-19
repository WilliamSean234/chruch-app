import { nameKey } from "./names";

/**
 * Urutan kemiripan nama: orang yang namanya paling banyak berbagi kata dengan nama pendaftar ada di atas.
 * Murni (tanpa database) supaya mudah diuji. "jessica gabriella wahyudi" cocok dengan "Jessica", "Jessica Gabriella", atau "Jessica W.".
 */
export function rankMatches<T extends { nameKey: string }>(requestName: string, candidates: T[], limit = 8): T[] {
  const want = nameKey(requestName).split(/\s+/).filter((t) => t.length >= 2);
  if (want.length === 0) return [];
  const scored = candidates.map((c) => {
    const have = c.nameKey.split(/\s+/).filter(Boolean);
    let score = 0;
    for (const w of want) {
      if (have.includes(w)) score += 3; // kata sama persis
      else if (have.some((h) => (h.length >= 3 && w.startsWith(h)) || (w.length >= 3 && h.startsWith(w)))) score += 1; // singkatan atau awalan: "Jess" ~ "Jessica"
    }
    if (have[0] && want[0] && have[0] === want[0]) score += 2; // nama depan sama
    return { c, score };
  });
  return scored.filter((x) => x.score >= 3).sort((a, b) => b.score - a.score || a.c.nameKey.localeCompare(b.c.nameKey)).slice(0, limit).map((x) => x.c);
}
