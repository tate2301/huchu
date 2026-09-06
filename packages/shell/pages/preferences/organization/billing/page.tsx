import { BillingPreferences } from "../../../../preferences/organization/billing-preferences";
import { PreferencesShell } from "../../../../preferences/preferences-shell";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesBillingPage() {
  await requirePreferencesAccess("billing");

  return (
    <PreferencesShell
      title="Billing"
      description="Review plan, renewal, limits, and offline payment handling."
    >
      <BillingPreferences />
    </PreferencesShell>
  );
}
