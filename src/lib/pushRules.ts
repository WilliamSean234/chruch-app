/**
 * Alamat layanan push yang boleh dipakai server (murni, mudah diuji). Alamat perangkat dikirim oleh browser pengguna, jadi tanpa batas ini
 * pengguna mana pun bisa menyuruh server mengirim permintaan ke alamat apa saja (termasuk jaringan internal) dan membaca sebagian jawabannya.
 * Hanya layanan push resmi browser: Chrome/Edge/Opera/Brave (FCM), Firefox (Mozilla), Edge lama (Windows), Safari (Apple).
 */
const HOSTS: { exact?: string; suffix?: string }[] = [
  { exact: "fcm.googleapis.com" },
  { exact: "push.services.mozilla.com" }, { suffix: ".push.services.mozilla.com" },
  { suffix: ".notify.windows.com" },
  { exact: "web.push.apple.com" }, { suffix: ".push.apple.com" },
];

export function isPushEndpoint(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (u.port && u.port !== "443") return false;
  const host = u.hostname.toLowerCase();
  return HOSTS.some((h) => (h.exact ? host === h.exact : host.endsWith(h.suffix!)));
}
