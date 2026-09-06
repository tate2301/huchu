import { BrandingSettingsSection } from "@/components/settings/branding/branding-settings-section";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesBrandingFinancePage() {
  await requirePreferencesAccess("branding");
  return <BrandingSettingsSection section="finance" />;
}
