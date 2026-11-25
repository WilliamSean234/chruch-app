import type { PersonLite } from "@/components/PersonFilter";

/** Isian acara online (ibadah atau rapat): tautan, pembicara, tema (rapat), dan siapa yang melihat tautan (ibadah). */
export type OnlineValue = {
  online: boolean; url: string; theme: string;
  speaker: PersonLite | null; speakerName: string;
  audience: "ALL" | "COMMUNITIES"; communityIds: string[];
  reminder: boolean; // pengingat sehari sebelumnya
};
export const emptyOnline: OnlineValue = { online: false, url: "", theme: "", speaker: null, speakerName: "", audience: "ALL", communityIds: [], reminder: true };

/** Dari detail acara/rapat di server ke nilai form. */
export function onlineFromDto(o: { isOnline: boolean; url: string | null; speaker: { personId: string | null; name: string } | null; communities?: { id: string }[]; visibleTo?: string; theme?: string | null; reminder?: boolean } | null | undefined): OnlineValue {
  if (!o?.isOnline) return emptyOnline;
  return {
    online: true, url: o.url ?? "", theme: o.theme ?? "",
    speaker: o.speaker?.personId ? { id: o.speaker.personId, name: o.speaker.name } : null,
    speakerName: o.speaker && !o.speaker.personId ? o.speaker.name : "",
    audience: o.visibleTo === "COMMUNITIES" ? "COMMUNITIES" : "ALL",
    communityIds: (o.communities ?? []).map((c) => c.id),
    reminder: o.reminder ?? true,
  };
}

/** Nilai form → isian yang dikirim ke server. Offline: hanya `online: false` supaya isian lama dibersihkan. */
export function onlineBody(v: OnlineValue, kind: "IBADAH" | "RAPAT") {
  if (!v.online) return { online: false };
  return {
    online: true,
    onlineReminder: v.reminder,
    onlineUrl: v.url.trim(),
    speakerPersonId: v.speaker?.id ?? null,
    speakerName: v.speaker ? null : v.speakerName.trim() || null,
    ...(kind === "IBADAH" ? { onlineCommunityIds: v.audience === "COMMUNITIES" ? v.communityIds : [] } : { theme: v.theme.trim() || null }),
  };
}

/** Pesan bila isian online belum lengkap, atau null bila siap dikirim. */
export const onlineProblem = (v: OnlineValue, kind: "IBADAH" | "RAPAT") =>
  !v.online ? null : !v.url.trim() ? "Isi tautan meeting online." : kind === "IBADAH" && v.audience === "COMMUNITIES" && v.communityIds.length === 0 ? "Pilih komunitas yang boleh melihat tautan, atau ubah ke semua orang." : null;
