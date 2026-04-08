import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentAuthSession } from "@/lib/auth-core/guards";
import { normalizeCallbackUrl } from "@/lib/auth-core/redirects";
import { getAuthStrategiesForSurface } from "@/lib/auth-core/strategy-registry";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";
import { isCashierRole, normalizePosCallbackUrl } from "@/lib/retail/pos-host";
import { companyLabelFromHost } from "@/lib/utils";
import { PosPortalLoginClient } from "./client";

export default async function PosPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/pos");
  const { callbackUrl } = await searchParams;
  const resolvedCallbackUrl = normalizePosCallbackUrl(
    normalizeCallbackUrl(callbackUrl, portalRouting.homePath),
    portalRouting.homePath,
  );
  const strategies = getAuthStrategiesForSurface("portal-login");
  const credentialsStrategy = strategies.find((strategy) => strategy.id === "credentials");
  if (!credentialsStrategy) {
    redirect("/access-blocked");
  }

  const session = await getCurrentAuthSession();
  if (session?.user) {
    if (!isCashierRole(session.user.role)) {
      redirect("/access-blocked");
    }
    redirect(resolvedCallbackUrl);
  }

  const companyLabel = companyLabelFromHost(hostHeader ?? "localhost", "Store");

  return (
    <PosPortalLoginClient
      companyLabel={companyLabel}
      callbackUrl={resolvedCallbackUrl}
      redirectTo={portalRouting.homePath}
      rememberMeEnabled={credentialsStrategy.supportsRememberMe}
    />
  );
}
