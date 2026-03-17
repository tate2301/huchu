import { redirect } from "next/navigation";
import { AdminMagicLinkLogin } from "@/components/admin-portal/admin-magic-link-login";
import { getCurrentAuthSession } from "@/lib/auth-core/guards";
import { normalizeCallbackUrl } from "@/lib/auth-core/redirects";
import { getAuthStrategiesForSurface } from "@/lib/auth-core/strategy-registry";
import { ADMIN_PORTAL_HOST, isAdminPortalHost } from "@/lib/admin-portal";
import { headers } from "next/headers";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";

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
  const strategies = getAuthStrategiesForSurface("admin-login");
  const adminStrategy = strategies.find((strategy) => strategy.id === "admin-email-link");

  if (!isAdminPortalHost(host)) {
    redirect("/access-blocked");
  }

  if (!adminStrategy) {
    redirect("/access-blocked");
  }

  const session = await getCurrentAuthSession();
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
