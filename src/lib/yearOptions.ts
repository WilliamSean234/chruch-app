/** Pilihan tahun untuk filter: hanya tahun yang punya data, ditambah tahun yang sedang dipilih (supaya kotak pilihan tidak kosong). Urut dari yang terbaru. */
export function yearOptions(years: readonly number[] | undefined, selected: number): number[] {
  return [...new Set([...(years ?? []), selected])].sort((a, b) => b - a);
}
