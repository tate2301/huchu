import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ProfilePreferences } from "@/components/preferences/account/profile-preferences";
import { PreferencesShell } from "@/components/preferences/preferences-shell";
import { authOptions } from "@/lib/auth";

export default async function PreferencesProfilePage() {
  const session = await getServerSession(authOptions);
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
