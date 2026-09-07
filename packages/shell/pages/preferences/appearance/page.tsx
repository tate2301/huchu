import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { AppearancePreferences } from "../../../preferences/account/appearance-preferences";
import { PreferencesShell } from "../../../preferences/preferences-shell";

export default async function PreferencesAppearancePage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <PreferencesShell
      title="Appearance"
      description="Set your light, dark, or system theme preference."
    >
      <AppearancePreferences />
    </PreferencesShell>
  );
}
