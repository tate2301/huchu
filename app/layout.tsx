import "@rtcamp/frappe-ui-react/theme";
import { Analytics } from "@vercel/analytics/next";
import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./themes/client.css";
import { AppProviders } from "@/components/providers/app-providers";
import { AppShell } from "@/components/layout/app-shell";
import {
  PLATFORM_APP_DESCRIPTION,
  PLATFORM_BRAND_NAME,
  PLATFORM_MARKETING_TAGLINE,
} from "@/lib/platform/brand";
import {
  getBrandingCssVariables,
  getEffectiveBrandingForHost,
} from "@/lib/platform/branding";
import { getHostHeaderFromRequestHeaders, getPlatformHostContext } from "@/lib/platform/tenant";
import {
  buildWorkspaceIconHref,
  buildWorkspaceManifestHref,
  resolveWorkspaceIdentityForHost,
} from "@/lib/platform/workspace-identity";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(requestHeaders);
  const identity = await resolveWorkspaceIdentityForHost(hostHeader);
  const branding = identity.branding;
  const workspaceName = identity.workspaceName;
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
      template: isProvisionedWorkspace
        ? `%s | ${workspaceIdentity}`
        : `%s | ${PLATFORM_BRAND_NAME}`,
    },
    applicationName: isProvisionedWorkspace
      ? workspaceIdentity
      : PLATFORM_BRAND_NAME,
    description,
    openGraph: {
      title: defaultTitle,
      description,
      type: "website",
      siteName: isProvisionedWorkspace
        ? workspaceIdentity
        : PLATFORM_BRAND_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title: defaultTitle,
      description,
    },
    manifest: buildWorkspaceManifestHref(identity),
    icons: {
      icon: [
        {
          url: buildWorkspaceIconHref(identity, { size: 192 }),
          sizes: "192x192",
          type: "image/svg+xml",
        },
        {
          url: buildWorkspaceIconHref(identity, { size: 512 }),
          sizes: "512x512",
          type: "image/svg+xml",
        },
      ],
      apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: isProvisionedWorkspace ? workspaceIdentity : PLATFORM_BRAND_NAME,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: true,
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
  const hostContext = getPlatformHostContext(hostHeader);
  const brandingVars = getBrandingCssVariables(branding);

  return (
    <html lang="en">
      <body
        className="font-sans subpixel-antialiased"
        data-portal-path={hostContext.portalPath ?? undefined}
        style={
          {
            "--font-ibm-plex-mono":
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            ...brandingVars,
          } as React.CSSProperties
        }
      >
        <Analytics />
        <div className="app-root">
          <AppProviders>
            <Suspense fallback={<div className="min-h-screen bg-background" />}>
              <AppShell hostPortalPath={hostContext.portalPath}>
                {children}
              </AppShell>
            </Suspense>
          </AppProviders>
        </div>
      </body>
    </html>
  );
}
