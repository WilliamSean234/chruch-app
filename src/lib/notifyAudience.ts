/**
 * Siapa saja yang diberi tahu lewat tombol "Beri tahu pelayan". Murni (tanpa database) supaya mudah diuji.
 * - Semua: semua orang yang punya kursi di acara (termasuk PIC dan Pembicara).
 * - Praise & Worship: pemusik (alat musik), Singer, dan Liturgos/WL. PIC dan Pembicara hanya masuk "Semua".
 * - EBM dan Usher: sesuai tim kursinya.
 */
import { seatKind } from "./seatRules";

export type StaffAudience = "ALL" | "PW" | "EBM" | "USHER";

export const STAFF_AUDIENCES: { value: StaffAudience; label: string; hint: string }[] = [
  { value: "ALL", label: "Semua pelayan", hint: "Semua orang yang bertugas di acara ini." },
  { value: "PW", label: "Tim Praise & Worship", hint: "Pemusik, singer, dan liturgos." },
  { value: "EBM", label: "Tim EBM", hint: "Semua posisi di tim EBM." },
  { value: "USHER", label: "Tim Usher", hint: "Semua posisi di tim Usher." },
];

export const isStaffAudience = (v: string): v is StaffAudience => STAFF_AUDIENCES.some((a) => a.value === v);

const isLiturgos = (ministryName: string) => /^(liturgos|wl)\b/i.test(ministryName.trim());

export function seatInAudience(audience: StaffAudience, teamName: string, ministryName: string): boolean {
  if (audience === "ALL") return true;
  const kind = seatKind(teamName, ministryName);
  if (audience === "EBM") return kind === "EBM";
  if (audience === "USHER") return kind === "USHER";
  return kind === "PEMUSIK" || isLiturgos(ministryName);
}
