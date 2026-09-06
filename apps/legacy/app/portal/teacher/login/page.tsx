import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentAuthSession } from "@/lib/auth-core/guards";
import { normalizeCallbackUrl } from "@/lib/auth-core/redirects";
import { getAuthStrategiesForSurface } from "@/lib/auth-core/strategy-registry";
import { getHostHeaderFromRequestHeaders, getPortalRequestRouting } from "@/lib/platform/tenant";
import { companyLabelFromHost } from "@/lib/utils";
import { TeacherPortalLoginClient } from "./client";

export default async function TeacherPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const headersList = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(headersList);
  const portalRouting = getPortalRequestRouting(hostHeader, "/portal/teacher");
  const { callbackUrl } = await searchParams;
  const resolvedCallbackUrl = normalizeCallbackUrl(callbackUrl, portalRouting.homePath);
  const strategies = getAuthStrategiesForSurface("portal-login");
  const credentialsStrategy = strategies.find((strategy) => strategy.id === "credentials");
  if (!credentialsStrategy) {
    redirect("/access-blocked");
  }

  const session = await getCurrentAuthSession();
  if (session?.user) {
    redirect(resolvedCallbackUrl);
  }

  const companyLabel = companyLabelFromHost(hostHeader ?? "localhost", "School");

  return (
    <TeacherPortalLoginClient
      companyLabel={companyLabel}
      callbackUrl={resolvedCallbackUrl}
      rememberMeEnabled={credentialsStrategy.supportsRememberMe}
    />
  );
}
