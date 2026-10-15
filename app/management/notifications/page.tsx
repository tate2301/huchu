import type { Metadata } from "next";

import { requirePreferencesAccess } from "@/lib/preferences/server";

import { RoutingSettings } from "./routing-settings";

export const metadata: Metadata = { title: "Notifications" };

/** Management → Notifications (MgmtNotifications): who hears about what across the workspace. */
export default async function NotificationRoutingPage() {
  await requirePreferencesAccess("notification-routing");
  return <RoutingSettings />;
}
