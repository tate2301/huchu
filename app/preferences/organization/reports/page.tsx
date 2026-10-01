import { requirePreferencesAccess } from "@/lib/preferences/server";

import { ReportsRegister } from "./reports-register";

export default async function PreferencesReportsPage() {
  await requirePreferencesAccess("reports");
  return <ReportsRegister />;
}
