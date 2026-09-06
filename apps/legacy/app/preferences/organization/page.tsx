import { OrganizationOverviewPreferences } from "@/components/preferences/organization/organization-overview-preferences";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { requirePreferencesAccess } from "@/lib/preferences/server";

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
