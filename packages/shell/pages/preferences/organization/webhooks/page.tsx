import { WebhooksPreferences } from "../../../../preferences/organization/webhooks-preferences";
import { PreferencesShell } from "../../../../preferences/preferences-shell";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesWebhooksPage() {
  await requirePreferencesAccess("webhooks");

  return (
    <PreferencesShell
      title="Webhooks"
      description="Addresses told when something happens in this workspace. Each request is signed with the endpoint's secret, shown once."
    >
      <WebhooksPreferences />
    </PreferencesShell>
  );
}
