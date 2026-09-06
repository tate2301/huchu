import { DepartmentsPreferences } from "../../../../components/preferences/departments-preferences";
import { PreferencesShell } from "@corelithzw/shell/preferences/preferences-shell";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesDepartmentsPage() {
  await requirePreferencesAccess("departments");

  return (
    <PreferencesShell
      title="Departments"
      description="Manage departments used for people, compensation, and approvals."
    >
      <DepartmentsPreferences />
    </PreferencesShell>
  );
}
