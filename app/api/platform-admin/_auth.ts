import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ADMIN_PORTAL_HOST, isAdminPortalHost, isSuperuserRole } from "@/lib/admin-portal";

export async function requirePlatformAdminAccess() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { ok: false as const, status: 401, error: "Unauthorized" };
  }

  if (!isSuperuserRole(session.user.role)) {
    return { ok: false as const, status: 403, error: "Superuser access required" };
  }

  const headersList = await headers();
  const host = headersList.get("host");
  if (!isAdminPortalHost(host)) {
    return { ok: false as const, status: 403, error: `Admin portal is only available on ${ADMIN_PORTAL_HOST}` };
  }

  return { ok: true as const, session };
}
