import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "../../auth/login-form";
import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/guards";
import { normalizeCallbackUrl } from "@corelithzw/platform/auth-core/redirects";
import { getAuthStrategiesForSurface } from "@corelithzw/platform/auth-core/strategy-registry";
import { getEffectiveBrandingForHost } from "@corelithzw/platform/branding";
import { getHostHeaderFromRequestHeaders } from "@corelithzw/platform/tenant";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const resolvedCallbackUrl = normalizeCallbackUrl(callbackUrl, "/");
  const session = await getCurrentAuthSession();
  if (session?.user) {
    redirect(resolvedCallbackUrl);
  }

  const requestHeaders = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(requestHeaders);
  const branding = await getEffectiveBrandingForHost(hostHeader);
  const strategies = getAuthStrategiesForSurface("primary-login");
  const credentialsStrategy = strategies.find((strategy) => strategy.id === "credentials");
  if (!credentialsStrategy) {
    redirect("/access-blocked");
  }

  return (
    <LoginForm
      companyLabel={branding.displayName}
      callbackUrl={resolvedCallbackUrl}
      rememberMeEnabled={credentialsStrategy.supportsRememberMe}
    />
  );
}
