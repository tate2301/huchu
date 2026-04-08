import "material-symbols";
import "@rtcamp/frappe-ui-react/theme";

import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./themes/client.css";
import { AppProviders } from "@/components/providers/app-providers";
import { AppShell } from "@/components/layout/app-shell";
import { PLATFORM_APP_DESCRIPTION, PLATFORM_BRAND_NAME, PLATFORM_MARKETING_TAGLINE } from "@/lib/platform/brand";
import { getBrandingCssVariables, getEffectiveBrandingForHost } from "@/lib/platform/branding";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(requestHeaders);
  const branding = await getEffectiveBrandingForHost(hostHeader);

  const workspaceName = branding.displayName?.trim() || branding.companyName?.trim() || PLATFORM_BRAND_NAME;
  const legalCompanyName = branding.companyName?.trim() || null;
  const workspaceIdentity =
    legalCompanyName && legalCompanyName !== workspaceName
      ? `${workspaceName} (${legalCompanyName})`
      : workspaceName;

  const isProvisionedWorkspace = Boolean(branding.companyId);
  const defaultTitle = isProvisionedWorkspace
    ? `${workspaceIdentity} Workspace`
    : `${PLATFORM_BRAND_NAME} | ${PLATFORM_MARKETING_TAGLINE}`;
  const description = isProvisionedWorkspace
    ? `${workspaceIdentity} operations workspace on ${PLATFORM_BRAND_NAME}.`
    : PLATFORM_APP_DESCRIPTION;

  return {
    title: {
      default: defaultTitle,
      template: isProvisionedWorkspace ? `%s | ${workspaceIdentity}` : `%s | ${PLATFORM_BRAND_NAME}`,
    },
    applicationName: isProvisionedWorkspace ? workspaceIdentity : PLATFORM_BRAND_NAME,
    description,
    openGraph: {
      title: defaultTitle,
      description,
      type: "website",
      siteName: isProvisionedWorkspace ? workspaceIdentity : PLATFORM_BRAND_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title: defaultTitle,
      description,
    },
    manifest: "/manifest.json",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#4C64D4",
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
