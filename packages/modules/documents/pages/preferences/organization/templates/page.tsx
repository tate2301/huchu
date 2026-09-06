import TemplateSettingsPage from "../../../../components/settings/templates/template-settings-page";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesTemplatesPage() {
  await requirePreferencesAccess("templates");
  return <TemplateSettingsPage />;
}
