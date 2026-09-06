import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { canViewPreferenceItem } from "@/lib/preferences/nav";

export async function requirePreferencesAccess(itemId?: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  if (itemId) {
    const user = session.user as {
      role?: string;
      enabledFeatures?: string[];
    };
    const allowed = canViewPreferenceItem(itemId, {
      role: user.role,
      enabledFeatures: user.enabledFeatures,
    });

    if (!allowed) {
      redirect("/preferences/profile");
    }
  }

  return session;
}
