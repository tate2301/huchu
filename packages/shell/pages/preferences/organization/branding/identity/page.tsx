import { BrandingSettingsSection } from "../../../../../branding/branding-settings-section";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesBrandingIdentityPage() {
  await requirePreferencesAccess("branding");
  return <BrandingSettingsSection section="identity" />;
}
