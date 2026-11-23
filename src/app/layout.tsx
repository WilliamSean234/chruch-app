import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import ConfirmHost from "@/components/ui/Confirm";
import ToastHost from "@/components/ui/Toast";
import NoticeHost from "@/components/ui/NoticeHost";
import PwaRegister from "@/components/ui/PwaRegister";
import PullToRefresh from "@/components/ui/PullToRefresh";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "Pelayanan — Penjadwalan Gereja",
  applicationName: "Pelayanan",
  appleWebApp: { capable: true, title: "Pelayanan", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};
// viewportFit "cover": agar jarak aman bawah (env(safe-area-inset-bottom)) di iPhone terbaca oleh tab bawah dan tombol melayang.
// maximumScale 1 dan userScalable false: layar HP tidak bisa di-zoom (cubit atau ketuk dua kali) secara tidak sengaja.
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: "cover", themeColor: "#3037a8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={manrope.variable}>
      <body>{children}<ConfirmHost /><NoticeHost /><ToastHost /><PwaRegister /><PullToRefresh /></body>
    </html>
  );
}
