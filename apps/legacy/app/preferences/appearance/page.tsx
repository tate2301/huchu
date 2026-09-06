import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AppearancePreferences } from "@/components/preferences/account/appearance-preferences";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { authOptions } from "@/lib/auth";

export default async function PreferencesAppearancePage() {
  const session = await getServerSession(authOptions);
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
