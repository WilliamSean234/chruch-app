import { badRequest } from "./errors";

/** Rapikan tautan meeting online: tanpa skema ditambah https://, hanya http/https. */
export function cleanOnlineUrl(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) throw badRequest("Isi tautan meeting online.");
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`); } catch { throw badRequest("Tautan meeting online tidak valid."); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw badRequest("Tautan meeting online harus diawali http atau https.");
  if (!u.hostname.includes(".")) throw badRequest("Tautan meeting online tidak valid.");
  return u.toString();
}

/**
 * Siapa yang melihat tautan ibadah online: penjadwal selalu; bila penerimanya semua orang, semua yang bisa melihat acara;
 * bila dibatasi komunitas, hanya yang terlibat (petugas atau pembicara acara itu) atau anggota salah satu komunitas itu.
 */
export const linkVisible = (a: { scheduler: boolean; restricted: boolean; involved: boolean; inCommunity: boolean }) =>
  a.scheduler || !a.restricted || a.involved || a.inCommunity;
