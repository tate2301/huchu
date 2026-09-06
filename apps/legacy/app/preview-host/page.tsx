import Link from "next/link";
import { headers } from "next/headers";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Card, CardContent, CardHeader } from "@corelithzw/ui/components/card";
import { Input } from "@corelithzw/ui/components/input";
import {
  getHostHeaderFromRequestHeaders,
  getPlatformHostContext,
  getRealHostHeaderFromRequestHeaders,
} from "@/lib/platform/tenant";
import { getPortalHostPrefixes } from "@/lib/platform/portal-hosts";
import {
  PREVIEW_HOST_PARAM,
  PREVIEW_TENANT_PARAM,
  isHostEnforcementBypassed,
  isPreviewHostOverrideEnabled,
} from "@/lib/platform/preview-host";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Preview host",
  robots: { index: false, follow: false },
};

/**
 * The control panel for the preview host override.
 *
 * Deliberately reachable without a session and outside tenant routing — it is
 * where you go when the deployment is pointed at the wrong tenant, and a page
 * behind the check it exists to fix would be no use.
 */
export default async function PreviewHostPage({
  searchParams,
}: {
  searchParams: Promise<{ invalid?: string }>;
}) {
  const { invalid } = await searchParams;
  const requestHeaders = await headers();
  const realHost = getRealHostHeaderFromRequestHeaders(requestHeaders);
  const effectiveHost = getHostHeaderFromRequestHeaders(requestHeaders);
  const hostContext = getPlatformHostContext(effectiveHost);
  const overrideEnabled = isPreviewHostOverrideEnabled();
  const enforcementBypassed = isHostEnforcementBypassed();
  const rootDomain = process.env.PLATFORM_ROOT_DOMAIN?.trim().toLowerCase() || null;
  const isOverridden = Boolean(realHost && effectiveHost && realHost !== effectiveHost);

  const facts: Array<{ label: string; value: string }> = [
    { label: "Real host", value: realHost ?? "unknown" },
    { label: "Treated as", value: effectiveHost ?? "unknown" },
    { label: "Root domain", value: rootDomain ?? "not set — tenant subdomains are off" },
    { label: "Tenant slug", value: hostContext.tenantSlug ?? "none" },
    { label: "Portal", value: hostContext.portalSubdomain ?? "none — main workspace" },
    {
      label: "Host enforcement",
      value: enforcementBypassed
        ? "bypassed"
        : hostContext.strictTenantEnforcement
          ? "strict"
          : "off",
    },
  ];

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <Card>
          <CardHeader className="space-y-3 border-b border-border/80 pb-5">
            <div className="flex items-center gap-2">
              <Badge variant={isOverridden ? "default" : "secondary"} className="w-fit">
                {isOverridden ? "Override active" : "No override"}
              </Badge>
              {enforcementBypassed ? (
                <Badge variant="secondary" className="w-fit">
                  Enforcement bypassed
                </Badge>
              ) : null}
            </div>
            <h1 className="text-page-title text-foreground">Preview host</h1>
            <p className="text-sm text-muted-foreground">
              This deployment answers on a generated hostname that belongs to no tenant. Nominate
              the host it should be treated as, and tenant routing, sign-in and the portals all
              behave as they would on the real domain.
            </p>
          </CardHeader>

          <CardContent className="space-y-6 py-5">
            {!overrideEnabled ? (
              <section className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4">
                <h2 className="text-sm font-semibold text-[var(--status-error-text)]">
                  The override is switched off here
                </h2>
                <p className="mt-2 text-sm text-[var(--status-error-text)]">
                  Set <code>PREVIEW_HOST_OVERRIDE=1</code> on this environment. It is refused
                  outright when <code>VERCEL_ENV</code> is <code>production</code>.
                </p>
              </section>
            ) : null}

            {invalid ? (
              <section className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4">
                <p className="text-sm text-[var(--status-error-text)]">
                  <span className="font-mono">{invalid}</span> is not a host this deployment will
                  accept. Check the spelling, and the allowlist if one is configured.
                </p>
              </section>
            ) : null}

            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {facts.map((fact) => (
                <div key={fact.label} className="space-y-1">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {fact.label}
                  </dt>
                  <dd className="font-mono text-sm text-foreground break-all">{fact.value}</dd>
                </div>
              ))}
            </dl>

            <form method="get" action="/preview-host" className="space-y-2">
              <label htmlFor="tenant" className="text-sm font-medium text-foreground">
                Tenant subdomain
              </label>
              <div className="flex gap-2">
                <Input
                  id="tenant"
                  name={PREVIEW_TENANT_PARAM}
                  placeholder="floorcode"
                  defaultValue={hostContext.tenantSlug ?? ""}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                />
                <Button type="submit" disabled={!overrideEnabled}>
                  Use tenant
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {rootDomain
                  ? `Expanded against ${rootDomain}.`
                  : "PLATFORM_ROOT_DOMAIN is not set, so a slug cannot be expanded into a host. Use the full host below."}
              </p>
            </form>

            <form method="get" action="/preview-host" className="space-y-2">
              <label htmlFor="host" className="text-sm font-medium text-foreground">
                Full host
              </label>
              <div className="flex gap-2">
                <Input
                  id="host"
                  name={PREVIEW_HOST_PARAM}
                  placeholder={rootDomain ? `pos.floorcode.${rootDomain}` : "pos.floorcode.example.com"}
                  defaultValue={effectiveHost ?? ""}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                />
                <Button type="submit" variant="outline" disabled={!overrideEnabled}>
                  Use host
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Portal prefixes work here too — a whole host is taken as written.
              </p>
            </form>

            {rootDomain && hostContext.tenantSlug ? (
              <section className="space-y-2">
                <h2 className="text-sm font-medium text-foreground">
                  Portals for {hostContext.tenantSlug}
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/preview-host?${PREVIEW_TENANT_PARAM}=${hostContext.tenantSlug}`}>
                      workspace
                    </Link>
                  </Button>
                  {getPortalHostPrefixes().map((prefix) => (
                    <Button asChild variant="outline" size="sm" key={prefix}>
                      <Link
                        href={`/preview-host?${PREVIEW_HOST_PARAM}=${prefix}.${hostContext.tenantSlug}.${rootDomain}`}
                      >
                        {prefix}
                      </Link>
                    </Button>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-border/80 pt-4">
              <Button asChild size="sm">
                <Link href="/login">Go to sign-in</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/preview-host?${PREVIEW_HOST_PARAM}=`}>Clear override</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Any page accepts <code className="font-mono">?{PREVIEW_TENANT_PARAM}=slug</code> or{" "}
          <code className="font-mono">?{PREVIEW_HOST_PARAM}=host</code> — the proxy stores it and
          redirects to the clean URL, so it never survives into a link you share.
        </p>
      </div>
    </main>
  );
}
