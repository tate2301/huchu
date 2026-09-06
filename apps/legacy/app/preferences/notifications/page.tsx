import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { NotificationPreferences } from "@/components/preferences/account/notification-preferences";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { authOptions } from "@/lib/auth";

export default async function PreferencesNotificationsPage() {
  const session = await getServerSession(authOptions);
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
