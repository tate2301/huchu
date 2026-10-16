import type { Metadata } from "next";

import { MarketplacePage } from "@/components/management/marketplace-view";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { offeredTemplates } from "@/lib/library/reports";
import { readWorkspaceLibrary } from "@/lib/library/workspace";
import { readMarketplace, verticalName } from "@/lib/management/marketplace";
import { requirePreferencesAccess } from "@/lib/preferences/server";
import { prisma } from "@/lib/prisma";
import { readableSources } from "@/lib/reports/custom/sources";

export const metadata: Metadata = { title: "Marketplace" };

/** Management → Marketplace: what the workspace can add, from what Corelith has. */
export default async function MarketplaceManagementPage() {
  const session = (await requirePreferencesAccess("marketplace")) as AuthenticatedSession;
  const sources = await readableSources(session);
  // Corelith's reports in code, then those published to this workspace from the library.
  const reportTemplates = (await offeredTemplates(session, sources)).map((template) => ({
    key: template.key,
    title: template.title,
    description: template.description || null,
  }));
  const sections = await readMarketplace(prisma, session.user.companyId, {
    reportTemplates,
    verticalName: verticalName(session.user.workspaceProfile),
    library: await readWorkspaceLibrary(session.user.companyId, session.user.enabledFeatures),
  });
  return <MarketplacePage sections={sections} />;
}
