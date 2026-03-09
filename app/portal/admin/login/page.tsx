import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AdminMagicLinkLogin } from "@/components/admin-portal/admin-magic-link-login";
import { authOptions } from "@/lib/auth";
import { ADMIN_PORTAL_HOST, isAdminPortalHost } from "@/lib/admin-portal";
import { headers } from "next/headers";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";

const DEFAULT_ADMIN_EMAIL = "thehalfstackdev@gmail.com";

export default async function AdminPortalLoginPage() {
  const headersList = await headers();
  const host = getHostHeaderFromRequestHeaders(headersList);

  if (!isAdminPortalHost(host)) {
    redirect("/access-blocked");
  }

  const session = await getServerSession(authOptions);
  if (session?.user?.role === "SUPERADMIN") {
    redirect("/admin/dashboard");
  }

  const adminEmail = process.env.ADMIN_PORTAL_EMAIL?.trim().toLowerCase() || DEFAULT_ADMIN_EMAIL;

  return (
    <>
      <AdminMagicLinkLogin adminEmail={adminEmail} />
      <p className="sr-only">Restricted host: {ADMIN_PORTAL_HOST}</p>
    </>
  );
}
