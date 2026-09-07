import { SitesPreferences } from "../../../../preferences/organization/sites-preferences";
import { PreferencesShell } from "../../../../preferences/preferences-shell";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

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
