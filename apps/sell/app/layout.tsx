// `globals.css` first, and it has to stay first: its `@layer` statement is the
// one that must reach the browser before any other. Frappe's theme is a second
// Tailwind build that declares `theme, base, components, utilities` and knows
// nothing of ours, so when it was imported ahead of this file it set the order
// itself and `corelith`/`app` — unknown names at that point — were appended
// after `utilities`. The design system's element resets then outranked every
// Tailwind utility in the app.
import "./globals.css";
import "@rtcamp/frappe-ui-react/theme";
import "./themes/corelith-bridge.css";
import { Analytics } from "@vercel/analytics/next";
import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { AppProviders } from "@/components/providers/app-providers";
import { AppShell } from "@/components/layout/app-shell";
import {
  PLATFORM_APP_DESCRIPTION,
  PLATFORM_BRAND_NAME,
  PLATFORM_MARKETING_TAGLINE,
} from "@corelithzw/platform/brand";
import {
  getBrandingCssVariables,
  getEffectiveBrandingForHost,
} from "@corelithzw/platform/branding";
import { authOptions } from "@/lib/auth";
import { getSiteUrl } from "@corelithzw/platform/site-url";
import { getHostHeaderFromRequestHeaders, getPlatformHostContext } from "@corelithzw/platform/tenant";
import {
  buildWorkspaceIconHref,
  buildWorkspaceManifestHref,
  resolveWorkspaceIdentityForHost,
} from "@corelithzw/platform/workspace-identity";

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
    // Lets every page emit absolute canonical and Open Graph URLs.
    metadataBase: new URL(getSiteUrl()),
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

  /**
   * The session, resolved on the server and handed to `SessionProvider`.
   *
   * Without this, `useSession()` had no data during SSR and every client
   * component that reads it rendered its signed-out shape into the HTML, then a
   * different shape on hydration. The sidebar was the visible casualty: the
   * workspace model falls back to the first profile when it is given no role and
   * no features, so the server sent Scrap & Recycling's label and icon and the
   * browser replaced them with School Operations — a hydration error on every
   * page of the app, including ones nothing in the schools work had touched.
   *
   * `getServerSession` here rather than a guard in the sidebar because the
   * sidebar is not the only reader: the command bar's module bands, the nav
   * filter and the quick actions all derive from the same three fields, and
   * fixing them one at a time is how the next one gets missed. The layout is
   * already dynamic — it reads `headers()` — so this costs a session decode, and
   * it saves the client's opening `/api/auth/session` round trip: given the prop,
   * `SessionProvider` treats it as the initial value instead of fetching.
   */
  const session = await getServerSession(authOptions);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>

      </head>
      <body
        /* No `font-sans`: frappe's theme ships its own `.font-sans` utility
           with Inter baked in literally, and two Tailwind builds writing the
           same utility into the same layer means the later one wins. The design
           system's `body` rule sets the family and is the authority here. */
        className="subpixel-antialiased"
        data-portal-path={hostContext.portalPath ?? undefined}
        style={brandingVars as React.CSSProperties}
      >
        <Analytics />
        <div className="app-root">
          <AppProviders session={session}>
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
