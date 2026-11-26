/** Isian "khusus komunitas" di form acara dan template. `on` dipisah dari `ids` supaya pilihan yang belum diisi bisa dikenali. */
export type AudienceValue = { on: boolean; ids: string[] };
export const emptyAudience: AudienceValue = { on: false, ids: [] };

/** Dari detail acara/template di server ke nilai form. */
export const audienceFromIds = (ids: { id: string }[] | string[] | null | undefined): AudienceValue => {
  const list = (ids ?? []).map((x) => (typeof x === "string" ? x : x.id));
  return list.length ? { on: true, ids: list } : emptyAudience;
};
/** Nilai form → isian yang dikirim ke server. Kosong = acara umum. */
export const audienceBody = (v: AudienceValue): string[] => (v.on ? v.ids : []);
/** Pesan bila "khusus komunitas" dinyalakan tetapi belum ada yang dipilih, atau null bila siap dikirim. */
export const audienceProblem = (v: AudienceValue): string | null => (v.on && v.ids.length === 0 ? "Pilih komunitas untuk acara khusus, atau matikan pilihan khusus komunitas." : null);
