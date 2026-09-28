import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { NotificationPreferences } from "@/components/preferences/account/notification-preferences";
import { authOptions } from "@/lib/auth";

/**
 * The gate is unchanged — session or `/login`, exactly as before.
 *
 * See `app/preferences/profile/page.tsx` for why the shell moved inside the
 * component: `FormPage` has to be a direct child of the surface's grid row.
 */
export default async function PreferencesNotificationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return <NotificationPreferences />;
}
