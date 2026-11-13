import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { BASE_PATH } from "@/lib/runtime";

const sans = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin", "latin-ext"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });

export const metadata: Metadata = {
  title: "Versio — Live lyrics, translated",
  description: "Time-synced Spotify lyrics with natural, line-by-line translation.",
  icons: { icon: `${BASE_PATH}/icon.svg`, apple: `${BASE_PATH}/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "Versio", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#090909",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-dvh bg-ink font-sans">{children}</body>
    </html>
  );
}
