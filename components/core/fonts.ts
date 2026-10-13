import localFont from "next/font/local";

/**
 * Inter, as the core modules kit is drawn (design/core-modules/spec/tokens.css):
 * the same variable file the references were rendered with, self-hosted, so a
 * screen and its reference set the same glyphs. `roles.css` reads the variable
 * for Corelith's `--font-sans`.
 */
export const inter = localFont({
  src: "./inter.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});
