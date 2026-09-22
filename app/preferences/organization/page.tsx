import { OrganizationOverviewPreferences } from "@/components/preferences/organization/organization-overview-preferences";
import { requirePreferencesAccess } from "@/lib/preferences/server";

/**
 * The gate is unchanged — `requirePreferencesAccess("organization")`, exactly
 * as before.
 *
 * `OrganizationOverviewPreferences` renders `PreferencesShell` itself so its
 * `FormPage` reaches the surface's grid row as a *direct* child. Wrapped in
 * anything else, `SettingsContent` cannot tell the screen draws its own
 * header, and it adds a second inset (`24px 40px 40px`) around a page that
 * already has the board's own (`24px 48px 40px`). Same reasoning as
 * `app/preferences/profile/page.tsx`.
 */
export default async function PreferencesOrganizationPage() {
  await requirePreferencesAccess("organization");

  return <OrganizationOverviewPreferences />;
}
