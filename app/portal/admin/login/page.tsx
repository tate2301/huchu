import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { AdminMagicLinkLogin } from "@/components/admin-portal/admin-magic-link-login";
import { authOptions } from "@/lib/auth";
import { ADMIN_PORTAL_HOST, isAdminPortalHost } from "@/lib/admin-portal";
import { headers } from "next/headers";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";
import { normalizeCallbackUrl } from "@/lib/auth-redirect";

const DEFAULT_ADMIN_EMAIL = "thehalfstackdev@gmail.com";

export default async function AdminPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const headersList = await headers();
  const host = getHostHeaderFromRequestHeaders(headersList);
  const { callbackUrl } = await searchParams;
  const resolvedCallbackUrl = normalizeCallbackUrl(callbackUrl, "/admin/dashboard");

  if (!isAdminPortalHost(host)) {
    redirect("/access-blocked");
  }

  const session = await getServerSession(authOptions);
  if (session?.user?.role === "SUPERADMIN") {
    redirect(resolvedCallbackUrl);
  }

  const adminEmail = process.env.ADMIN_PORTAL_EMAIL?.trim().toLowerCase() || DEFAULT_ADMIN_EMAIL;

  return (
    <>
      <AdminMagicLinkLogin adminEmail={adminEmail} callbackUrl={resolvedCallbackUrl} />
      <p className="sr-only">Restricted host: {ADMIN_PORTAL_HOST}</p>
    </>
  );
}
