import { UsersPreferences } from "@/components/preferences/organization/users-preferences";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { requirePreferencesAccess } from "@/lib/preferences/server";

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
