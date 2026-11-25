import { askConfirm } from "@/components/ui/Confirm";
import { callApi } from "@/components/jadwal/api";

/**
 * Tambah atau cabut pelayanan satu orang (selisihnya saja). Bila orangnya baru pertama kali diberi pelayanan EBM,
 * server minta konfirmasi dulu; jawabannya ("masukkan juga ke kelompok EBM?") dikirim ulang bersama permintaan yang sama.
 */
export async function patchMinistries(personId: string, personName: string, body: { add?: string[]; remove?: string[] }) {
  const url = `/api/v1/persons/${personId}/ministries`;
  const r = await callApi("PATCH", url, body);
  if (r.ok || r.data?.error?.code !== "EBM_GROUP_CONFIRM") return r;
  const join = await askConfirm(
    `Masukkan ${personName} juga ke kelompok EBM? Ini pertama kalinya ${personName} diberi pelayanan EBM. Bila ya, ia menjadi anggota kelompok EBM dan bisa membaca isi rapat kelompok itu.`,
    { title: "Masukkan ke kelompok EBM?", confirmLabel: "Ya, masukkan", cancelLabel: "Tidak" },
  );
  return callApi("PATCH", url, { ...body, ebmGroup: join ? "join" : "skip" });
}
