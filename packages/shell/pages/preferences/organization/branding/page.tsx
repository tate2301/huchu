import { redirect } from "next/navigation";

import { requirePreferencesAccess } from "@corelithzw/platform/preferences/server";

export default async function PreferencesBrandingPage() {
  await requirePreferencesAccess("branding");
  redirect("/preferences/organization/branding/identity");
}
