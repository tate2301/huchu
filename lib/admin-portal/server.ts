import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isAdminPortalHost, isSuperuserRole } from "@/lib/admin-portal";

export async function requireAdminPortalSession() {
  const headersList = await headers();
  const host = headersList.get("host");
  if (!isAdminPortalHost(host)) {
    redirect("/access-blocked");
  }

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/portal/admin/login");
  }

  if (!isSuperuserRole(session.user.role)) {
    redirect("/access-blocked");
  }

  return session;
}
