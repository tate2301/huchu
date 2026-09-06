import { DepartmentsPreferences } from "@/components/preferences/organization/departments-preferences";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
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
