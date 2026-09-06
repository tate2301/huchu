import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/guards";
import { normalizeCallbackUrl } from "@corelithzw/platform/auth-core/redirects";
import { getAuthStrategiesForSurface } from "@corelithzw/platform/auth-core/strategy-registry";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@corelithzw/platform/tenant";
import { canAccessPosPortal, normalizePosCallbackUrl } from "@corelithzw/module-sell/pos-host";
import { companyLabelFromHost } from "@corelithzw/ui/lib/utils";
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
    if (!canAccessPosPortal(session.user.role)) {
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
