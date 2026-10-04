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
// After the bridge: the roles answer the package's tokens, so they have the
// last word (00-foundations 5.1).
import "./themes/roles.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { cache, Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { AppProviders } from "@/components/providers/app-providers";
import { AppShell } from "@/components/layout/app-shell";
import { isAdminPortalHost } from "@/lib/admin-portal";
import {
  PLATFORM_APP_DESCRIPTION,
  PLATFORM_BRAND_NAME,
  PLATFORM_MARKETING_TAGLINE,
} from "@/lib/platform/brand";
import { getBrandingCssVariables } from "@/lib/platform/branding";
import { authOptions } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site-url";
import { getHostHeaderFromRequestHeaders, getPlatformHostContext } from "@/lib/platform/tenant";
import {
  buildWorkspaceIconHref,
  buildWorkspaceManifestHref,
  resolveWorkspaceIdentityForHost,
} from "@/lib/platform/workspace-identity";
import {
  APPEARANCE_SCRIPT,
  productForProfile,
  themeColorForProduct,
  themesForProduct,
  type Product,
} from "@/lib/theme/products";

/**
 * The request's workspace, session and product, resolved once per request and
 * shared by the metadata, the viewport and the layout.
 *
 * The workspace's profile is its primary product (5.1.1): the session's claim
 * first, else the host's company. The admin portal is always the Corelith
 * product, whoever is signed in to it.
 *
 * The session is also handed to `SessionProvider`. Without it `useSession()`
 * had no data during SSR and every client component that reads it rendered
 * its signed-out shape into the HTML, then a different shape on hydration —
 * the sidebar, the command bar's module bands, the nav filter and the quick
 * actions all derive from it. Given the prop, `SessionProvider` treats it as
 * the initial value instead of fetching `/api/auth/session`.
 */
const resolveRequestWorkspace = cache(async () => {
  const requestHeaders = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(requestHeaders);
  const [identity, session] = await Promise.all([
    resolveWorkspaceIdentityForHost(hostHeader),
    getServerSession(authOptions),
  ]);
  const product: Product = isAdminPortalHost(hostHeader)
    ? "corelith"
    : productForProfile(session?.user?.workspaceProfile ?? identity.workspaceProfile);
  return { hostHeader, identity, session, product };
});

export async function generateMetadata(): Promise<Metadata> {
  const { identity } = await resolveRequestWorkspace();
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
    // The workspace's own icon: its logo contained on a square, or its initial
    // on its colour when it has no logo. Never the logo file itself — most
    // logos are wordmarks, and a tab crops a wordmark to a smear.
    icons: {
      icon: [32, 192, 512].map((size) => ({
        url: buildWorkspaceIconHref(identity, { size }),
        sizes: `${size}x${size}`,
        type: "image/png",
      })),
      apple: [
        {
          url: buildWorkspaceIconHref(identity, { size: 180, purpose: "apple" }),
          sizes: "180x180",
          type: "image/png",
        },
      ],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: isProvisionedWorkspace ? workspaceIdentity : PLATFORM_BRAND_NAME,
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const { product } = await resolveRequestWorkspace();
  return {
    width: "device-width",
    initialScale: 1,
    userScalable: true,
    themeColor: themeColorForProduct(product),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The host's workspace, or the signed-in one's on a shared host — the same
  // resolution the favicon and title use, so the rail's logo, the tab's icon
  // and the page's theme all describe one workspace.
  const { hostHeader, identity, session, product } = await resolveRequestWorkspace();
  const branding = identity.branding;
  const workspaceBrand = identity.companyId
    ? { name: identity.workspaceName, logoUrl: identity.logoUrl }
    : null;
  const hostContext = getPlatformHostContext(hostHeader);
  const brandingVars = getBrandingCssVariables(branding);

  return (
    /*
      The product's light theme is in the server HTML; the inline script swaps
      in its dark one from the person's stored choice before the first paint.
      `suppressHydrationWarning` because that swap is a deliberate difference
      between the server's `<html>` and the one React hydrates.
    */
    <html
      lang="en-GB"
      data-product={product}
      data-theme={themesForProduct(product).light}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
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
        <SpeedInsights />
        <div className="app-root">
          <AppProviders session={session} product={product}>
            <Suspense fallback={<div className="min-h-screen bg-background" />}>
              <AppShell
                hostPortalPath={hostContext.portalPath}
                workspaceBrand={workspaceBrand}
              >
                {children}
              </AppShell>
            </Suspense>
          </AppProviders>
        </div>
      </body>
    </html>
  );
}
