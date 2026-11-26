import { nameKey } from "./names";

/**
 * Sentuhan pribadi: bunga kecil di pojok kanan bawah foto inisial, hanya untuk akun orang tertentu dan hanya terlihat olehnya sendiri
 * (hanya digambar di kapsul profil dan halaman Profil milik akun yang sedang login, jadi tidak pernah muncul di daftar atau layar orang lain).
 * Dicocokkan lewat nama orangnya (huruf besar-kecil dan gelar diabaikan, sama seperti pencegahan nama dobel). Tambah nama lain di sini bila perlu.
 */
const FLOWER_FOR = new Set(["Jessica Gabriella Wahyudi"].map(nameKey));

export const hasFlower = (name: string | null | undefined): boolean => !!name && FLOWER_FOR.has(nameKey(name));
