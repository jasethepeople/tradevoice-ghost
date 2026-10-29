import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradeVoice Ghost — Your always-on trade receptionist",
  description: "An AI receptionist that answers calls, triages urgent trade jobs, and helps small HVAC, plumbing, and electrical shops recover work.",
  applicationName: "TradeVoice Ghost",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TradeVoice Ghost", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#16251d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
