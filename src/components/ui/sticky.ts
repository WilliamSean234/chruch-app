/**
 * Baris yang menempel di bawah header saat halaman digulir (filter, tab, pilih tanggal).
 * `--stick-top` = tinggi baris lengket lain di atasnya (mis. tab Pengaturan), supaya keduanya bertumpuk rapi.
 * Header baru lengket di layar md ke atas; di HP baris ini menempel di tepi atas layar.
 */
const TOP = "top-[var(--stick-top,0px)] md:top-[calc(var(--header-h)+var(--stick-top,0px))]";
const SHADOW = "shadow-[0_10px_10px_-10px_rgba(23,26,44,0.14)]";

/** Pada halaman penuh: melebar sampai tepi isi halaman supaya isi yang lewat di bawahnya tertutup rapi. */
export const stickyPage = `sticky z-20 -mx-5 bg-[var(--bg)] px-5 py-2.5 md:-mx-8 md:px-8 ${TOP} ${SHADOW}`;
/** Di dalam kartu putih (mis. daftar anggota kelompok). */
export const stickyCard = `sticky z-20 bg-white py-2.5 ${TOP}`;
