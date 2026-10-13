import type { Metadata } from "next";

import { requirePreferencesAccess } from "@/lib/preferences/server";

import { ReportsSettings } from "./reports-settings";

export const metadata: Metadata = { title: "Reports" };

/** Management → Reports: which reports this workspace offers, and how each opens. */
export default async function ReportsManagementPage() {
  await requirePreferencesAccess("reports");
  return <ReportsSettings />;
}
