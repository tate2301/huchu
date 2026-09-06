import { BrandingSettingsSection } from "@/components/settings/branding/branding-settings-section";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesBrandingAssetsPage() {
  await requirePreferencesAccess("branding");
  return <BrandingSettingsSection section="assets" />;
}
