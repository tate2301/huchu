import type { Metadata } from "next";

import { MarketplacePage } from "@/components/management/marketplace-view";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { readMarketplace, verticalName } from "@/lib/management/marketplace";
import { requirePreferencesAccess } from "@/lib/preferences/server";
import { prisma } from "@/lib/prisma";
import { readableSources } from "@/lib/reports/custom/sources";
import { templatesFor } from "@/lib/reports/custom/templates";

export const metadata: Metadata = { title: "Marketplace" };

/** Management → Marketplace: what the workspace can add, from what Corelith has. */
export default async function MarketplaceManagementPage() {
  const session = (await requirePreferencesAccess("marketplace")) as AuthenticatedSession;
  const sources = await readableSources(session);
  const reportTemplates = templatesFor(sources, { id: session.user.id, role: session.user.role }, session.user.workspaceProfile).map(
    (template) => ({ key: template.key, title: template.title, description: template.description ?? null }),
  );
  const sections = await readMarketplace(prisma, session.user.companyId, {
    reportTemplates,
    verticalName: verticalName(session.user.workspaceProfile),
  });
  return <MarketplacePage sections={sections} />;
}
