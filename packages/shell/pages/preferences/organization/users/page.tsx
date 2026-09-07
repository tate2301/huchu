import { UsersPreferences } from "../../../../preferences/organization/users-preferences";
import { PreferencesShell } from "../../../../preferences/preferences-shell";
import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesUsersPage() {
  await requirePreferencesAccess("users");

  return (
    <PreferencesShell
      title="Users"
      description="Manage workspace users, roles, and account lifecycle."
    >
      <UsersPreferences />
    </PreferencesShell>
  );
}
