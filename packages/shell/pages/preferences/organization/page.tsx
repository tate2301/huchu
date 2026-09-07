import { OrganizationOverviewPreferences } from "../../../preferences/organization/organization-overview-preferences";
import { PreferencesShell } from "../../../preferences/preferences-shell";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesOrganizationPage() {
  await requirePreferencesAccess("organization");

  return (
    <PreferencesShell
      title="Organization"
      description="Review workspace identity and access context."
    >
      <OrganizationOverviewPreferences />
    </PreferencesShell>
  );
}
