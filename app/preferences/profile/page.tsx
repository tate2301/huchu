import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ProfilePreferences } from "@/components/preferences/account/profile-preferences";
import { authOptions } from "@/lib/auth";

/**
 * The gate is unchanged — session or `/login`, exactly as before.
 *
 * `ProfilePreferences` renders the shell itself so its `FormPage` reaches the
 * surface's grid row as a direct child. Wrapped in anything else the shell
 * cannot tell that the screen draws its own header, and it adds a second title
 * line and a second inset around a page that already has both.
 */
export default async function PreferencesProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return <ProfilePreferences />;
}
