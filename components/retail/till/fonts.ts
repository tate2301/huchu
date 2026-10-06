import { Atkinson_Hyperlegible_Next, IBM_Plex_Mono } from "next/font/google";

/** The till's two faces, self-hosted by Next: words in Atkinson, figures in Plex Mono. */
export const tillSans = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-till-sans",
  display: "swap",
  // Next has no metrics for this face to build a fallback from; the stack in till.css is the fallback.
  adjustFontFallback: false,
});

export const tillMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-till-mono",
  display: "swap",
});
