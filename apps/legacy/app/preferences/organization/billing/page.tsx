import { BillingPreferences } from "@/components/preferences/organization/billing-preferences";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { requirePreferencesAccess } from "@/lib/preferences/server";

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
