import { redirect } from "next/navigation";

import { requirePreferencesAccess } from "@/lib/preferences/server";

export default async function PreferencesBrandingPage() {
  await requirePreferencesAccess("branding");
  redirect("/preferences/organization/branding/identity");
}
