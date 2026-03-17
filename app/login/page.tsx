import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentAuthSession } from "@/lib/auth-core/guards";
import { normalizeCallbackUrl } from "@/lib/auth-core/redirects";
import { getAuthStrategiesForSurface } from "@/lib/auth-core/strategy-registry";
import { getEffectiveBrandingForHost } from "@/lib/platform/branding";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";

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
