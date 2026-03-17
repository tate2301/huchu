import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentAuthSession } from "@/lib/auth-core/guards";
import { normalizeCallbackUrl } from "@/lib/auth-core/redirects";
import { getAuthStrategiesForSurface } from "@/lib/auth-core/strategy-registry";
import { companyLabelFromHost } from "@/lib/utils";
import { TeacherPortalLoginClient } from "./client";

export default async function TeacherPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const resolvedCallbackUrl = normalizeCallbackUrl(callbackUrl, "/portal/teacher");
  const strategies = getAuthStrategiesForSurface("portal-login");
  const credentialsStrategy = strategies.find((strategy) => strategy.id === "credentials");
  if (!credentialsStrategy) {
    redirect("/access-blocked");
  }

  const session = await getCurrentAuthSession();
  if (session?.user) {
    redirect(resolvedCallbackUrl);
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost";
  const companyLabel = companyLabelFromHost(host, "School");

  return (
    <TeacherPortalLoginClient
      companyLabel={companyLabel}
      callbackUrl={resolvedCallbackUrl}
      rememberMeEnabled={credentialsStrategy.supportsRememberMe}
    />
  );
}
