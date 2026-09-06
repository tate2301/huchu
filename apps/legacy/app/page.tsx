import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { HomeMarketingPage } from "@/app/home/home-content";
import { seoPages } from "@/app/home/site-data";
import { buildMarketingMetadata } from "@/lib/marketing/seo";
import { PLATFORM_BRAND_NAME } from "@/lib/platform/brand";
import { getHostHeaderFromRequestHeaders, getPlatformHostContext } from "@/lib/platform/tenant";
import { getComputedWorkspaceHomeHref } from "@/lib/workspaces";

export const metadata = {
  ...buildMarketingMetadata(seoPages.root),
  title: { absolute: PLATFORM_BRAND_NAME },
};

/**
 * The site root. On the marketing domain this IS the landing page — it is the
 * URL customers type and link to, so it renders directly instead of redirecting
 * to /home, which would cost a hop and split link equity across two URLs.
 *
 * Tenant subdomains keep the original behaviour: their root is the workspace,
 * not a marketing page.
 */
export default async function RootPage() {
  const requestHeaders = await headers();
  const hostContext = getPlatformHostContext(getHostHeaderFromRequestHeaders(requestHeaders));
  const session = await getServerSession(authOptions);

  if (session?.user) {
    redirect(
      getComputedWorkspaceHomeHref({
        role: session.user.role,
        enabledFeatures: session.user.enabledFeatures,
        workspaceProfile: session.user.workspaceProfile,
      }),
    );
  }

  // A signed-out visitor on a tenant workspace host wants to sign in, not read
  // marketing copy about a product their company already bought.
  if (hostContext.isTenantHost) {
    redirect("/login");
  }

  return <HomeMarketingPage />;
}
