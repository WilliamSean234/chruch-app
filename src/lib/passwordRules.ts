/** Aturan kata sandi yang dipakai di layar dan server. Sengaja sederhana; file ini aman dipakai di sisi klien. */
export const PASSWORD_MIN = 8;
/** Cek format email ringan untuk umpan balik langsung di layar; pemeriksaan sebenarnya dilakukan server. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isEmail = (v: string) => EMAIL_RE.test(v.trim());
