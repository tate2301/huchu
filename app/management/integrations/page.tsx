import type { Metadata } from "next";

import { IntegrationsPage } from "@/components/management/integrations-view";
import { readIntegrations } from "@/lib/management/integrations";
import { requirePreferencesAccess } from "@/lib/preferences/server";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Integrations" };

/** Management → Integrations, read from what the workspace has connected. */
export default async function IntegrationsManagementPage() {
  const session = await requirePreferencesAccess("integrations");
  const data = await readIntegrations(prisma, session.user.companyId, {
    features: session.user.enabledFeatures ?? [],
    whatsappConfigured: Boolean(process.env.META_WHATSAPP_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID),
  });
  return <IntegrationsPage data={data} />;
}
