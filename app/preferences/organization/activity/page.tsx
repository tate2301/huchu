import { ActivityPreferences } from "@/components/preferences/organization/activity-preferences";
import { requirePreferencesAccess } from "@/lib/preferences/server";

export default async function PreferencesActivityPage() {
  await requirePreferencesAccess("activity");

  return <ActivityPreferences />;
}
