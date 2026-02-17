import { headers } from "next/headers";
import { LoginForm } from "@/components/auth/login-form";
import { getEffectiveBrandingForHost } from "@/lib/platform/branding";
import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";

export default async function LoginPage() {
  const requestHeaders = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(requestHeaders);
  const branding = await getEffectiveBrandingForHost(hostHeader);

  return <LoginForm companyLabel={branding.displayName} />;
}
