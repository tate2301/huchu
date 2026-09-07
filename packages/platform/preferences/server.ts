import { redirect } from "next/navigation";

import { getCurrentAuthSession } from "../auth-core/session";
import { canViewPreferenceItem } from "./nav";

export async function requirePreferencesAccess(itemId?: string) {
  const session = await getCurrentAuthSession();
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
