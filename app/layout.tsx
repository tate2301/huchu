import "material-symbols";

import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { AppShell } from "@/components/layout/app-shell";
import { getBrandingCssVariables, getEffectiveBrandingForHost } from "@/lib/platform/branding";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(requestHeaders);
  const branding = await getEffectiveBrandingForHost(hostHeader);
  const brandingVars = getBrandingCssVariables(branding);

  return (
    <html lang="en">
      <body
        className="font-sans subpixel-antialiased"
        style={
          {
            "--font-ibm-plex-mono":
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            ...brandingVars,
          } as React.CSSProperties
        }
      >
        <div className="app-root">
          <AppProviders>
            <Suspense fallback={<div className="min-h-screen bg-background" />}>
              <AppShell>{children}</AppShell>
            </Suspense>
          </AppProviders>
        </div>
      </body>
    </html>
  );
}
