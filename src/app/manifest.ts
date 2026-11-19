import type { MetadataRoute } from "next";

/** Agar aplikasi bisa dipasang di layar utama HP (PWA). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Pelayanan — Penjadwalan Gereja",
    short_name: "Pelayanan",
    description: "Jadwal pelayanan, kehadiran, dan rapat gereja.",
    lang: "id",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f4f9",
    theme_color: "#3037a8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
