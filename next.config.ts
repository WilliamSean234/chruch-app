import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false, // sembunyikan ikon "N" Next.js di pojok kiri bawah (hanya muncul saat dev)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // CSP bagian aman: tidak membatasi skrip/gaya (Next.js memakai skrip sebaris), tetapi menutup bingkai, <base>, <object>, dan tujuan form.
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
