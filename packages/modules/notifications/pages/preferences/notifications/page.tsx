import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { NotificationPreferences } from "../../../components/preferences/notification-preferences";
import { PreferencesShell } from "@corelithzw/shell/preferences/preferences-shell";

export default async function PreferencesNotificationsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <PreferencesShell
      title="Notifications"
      description="Choose which updates should reach your account."
    >
      <NotificationPreferences />
    </PreferencesShell>
  );
}
