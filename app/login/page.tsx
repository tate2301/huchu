import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentAuthSession } from "@/lib/auth-core/guards";
import { normalizeCallbackUrl } from "@/lib/auth-core/redirects";
import { getAuthStrategiesForSurface } from "@/lib/auth-core/strategy-registry";
import { getEffectiveBrandingForHost } from "@/lib/platform/branding";
import { prisma } from "@/lib/prisma";
import { getHostHeaderFromRequestHeaders, getPlatformHostContext, resolveTenantFromHost } from "@/lib/platform/tenant";
import { TillDoor } from "@/components/retail/till/door";
import { tillMono, tillSans } from "@/components/retail/till/fonts";
import { TillRoot } from "@/components/retail/till/till-root";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  // On a till's address this is the till's door, not the workspace sign-in.
  const requestHeaders = await headers();
  const hostHeader = getHostHeaderFromRequestHeaders(requestHeaders);
  if (getPlatformHostContext(hostHeader).portalCanonicalPrefix === "pos") {
    return (
      <TillRoot fontClass={`${tillSans.variable} ${tillMono.variable}`}>
        <TillDoor />
      </TillRoot>
    );
  }

  const { callbackUrl } = await searchParams;
  const resolvedCallbackUrl = normalizeCallbackUrl(callbackUrl, "/");
  const session = await getCurrentAuthSession();
  if (session?.user) {
    redirect(resolvedCallbackUrl);
  }

  const branding = await getEffectiveBrandingForHost(hostHeader);
  const strategies = getAuthStrategiesForSurface("primary-login");
  const credentialsStrategy = strategies.find((strategy) => strategy.id === "credentials");
  if (!credentialsStrategy) {
    redirect("/access-blocked");
  }
  const codeSignInEnabled = strategies.some((strategy) => strategy.id === "email-code");

  // A self-serve workspace signed up without passwords, so it opens on the
  // emailed code. An operator-provisioned one opens on the password its people
  // were given.
  const tenant = await resolveTenantFromHost(hostHeader);
  const company = tenant
    ? await prisma.company.findUnique({ where: { id: tenant.companyId }, select: { product: true } })
    : null;
  const defaultMethod = company && company.product !== "CORELITH" ? "code" : "password";

  return (
    <LoginForm
      companyLabel={branding.displayName}
      callbackUrl={resolvedCallbackUrl}
      rememberMeEnabled={credentialsStrategy.supportsRememberMe}
      codeSignInEnabled={codeSignInEnabled}
      defaultMethod={defaultMethod}
    />
  );
}
