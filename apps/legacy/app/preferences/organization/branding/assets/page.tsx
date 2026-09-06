import { BrandingSettingsSection } from "@/components/settings/branding/branding-settings-section";
import { requirePreferencesAccess } from "@/lib/preferences/server";

export default async function PreferencesBrandingAssetsPage() {
  await requirePreferencesAccess("branding");
  return <BrandingSettingsSection section="assets" />;
}
