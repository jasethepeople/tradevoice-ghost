import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TradeVoice Ghost — AI Receptionist",
    short_name: "TradeVoice",
    description: "Your always-on receptionist for HVAC, plumbing, and electrical calls.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f9f6",
    theme_color: "#16251d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
