import "material-symbols";

import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { AppShell } from "@/components/layout/app-shell";

// Google Fonts are loaded via CSS in globals.css as a fallback for build environments
// where next/font/google cannot fetch fonts during build time
const fontVariables = "";

export const metadata: Metadata = {
  title: "Huchu - Mine Operations System",
  description: "Digital operations management for small-scale gold mines",
  manifest: "/manifest.json",
  themeColor: "#2490ef",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans subpixel-antialiased">
        <div className="app-root">
          <AppProviders>
            <AppShell>{children}</AppShell>
          </AppProviders>
        </div>
      </body>
    </html>
  );
}
