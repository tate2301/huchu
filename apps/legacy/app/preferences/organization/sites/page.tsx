import { SitesPreferences } from "@/components/preferences/organization/sites-preferences";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { requirePreferencesAccess } from "@/lib/preferences/server";

export default async function PreferencesSitesPage() {
  await requirePreferencesAccess("sites");

  return (
    <PreferencesShell
      title="Sites"
      description="Manage operational sites used across reporting and workflows."
    >
      <SitesPreferences />
    </PreferencesShell>
  );
}
