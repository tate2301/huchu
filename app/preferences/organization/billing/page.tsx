import { BillingPreferences } from "@/components/preferences/organization/billing-preferences";
import { requirePreferencesAccess } from "@/lib/preferences/server";

/**
 * The gate is unchanged — `requirePreferencesAccess("billing")`, exactly as
 * before. See the organization page for why the shell moved inside the
 * component.
 */
export default async function PreferencesBillingPage() {
  await requirePreferencesAccess("billing");

  return <BillingPreferences />;
}
