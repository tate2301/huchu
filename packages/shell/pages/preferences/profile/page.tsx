import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { ProfilePreferences } from "../../../preferences/account/profile-preferences";
import { PreferencesShell } from "../../../preferences/preferences-shell";

export default async function PreferencesProfilePage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <PreferencesShell
      title="Profile"
      description="Manage your account details for this workspace."
    >
      <ProfilePreferences />
    </PreferencesShell>
  );
}
