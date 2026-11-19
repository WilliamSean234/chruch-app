/*
 * Service worker aplikasi Pelayanan.
 * Sengaja SANGAT terbatas: data gereja (jadwal, orang, notulen) tidak pernah disimpan di HP lewat cache.
 *  - Halaman dan /api: selalu dari jaringan. Bila tidak ada koneksi, tampil halaman offline.
 *  - Hanya berkas statis yang tidak berubah (/_next/static, ikon) disimpan agar aplikasi cepat terbuka.
 */
const CACHE = "pelayanan-static-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pelayanan-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Buka halaman: jaringan dulu, tidak pernah disimpan. Gagal (offline) = halaman offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Berkas statis yang namanya berisi hash (tidak pernah berubah isinya) dan ikon: simpan dan pakai ulang.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
  // Selain itu (termasuk /api): tidak disentuh, langsung ke jaringan.
});
