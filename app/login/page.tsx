import { headers } from "next/headers";
import { LoginForm } from "@/components/auth/login-form";
import { getEffectiveBrandingForHost } from "@/lib/platform/branding";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";
import { normalizeCallbackUrl } from "@/lib/auth-redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const requestHeaders = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(requestHeaders);
  const branding = await getEffectiveBrandingForHost(hostHeader);
  const { callbackUrl } = await searchParams;

  return <LoginForm companyLabel={branding.displayName} callbackUrl={normalizeCallbackUrl(callbackUrl, "/")} />;
}
