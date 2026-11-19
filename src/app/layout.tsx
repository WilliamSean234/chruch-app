import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import ConfirmHost from "@/components/ui/Confirm";
import ToastHost from "@/components/ui/Toast";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = { title: "Pelayanan — Penjadwalan Gereja" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={manrope.variable}>
      <body>{children}<ConfirmHost /><ToastHost /></body>
    </html>
  );
}
