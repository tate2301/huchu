import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { PortalChoice } from "@/components/preview-host/portal-choice";
import { tillMono, tillSans } from "@/components/retail/till/fonts";
import { TillRoot } from "@/components/retail/till/till-root";
import { CaretRight, Check, WarningCircle, X } from "@/lib/icons";
import { getPortalHostPrefixes } from "@/lib/platform/portal-hosts";
import {
  PREVIEW_HOST_PARAM,
  PREVIEW_TENANT_PARAM,
  isHostEnforcementBypassed,
  isPreviewHostOverrideEnabled,
} from "@/lib/platform/preview-host";
import {
  getHostHeaderFromRequestHeaders,
  getPlatformHostContext,
  getRealHostHeaderFromRequestHeaders,
  resolveTenantFromHost,
} from "@/lib/platform/tenant";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Preview host",
  robots: { index: false, follow: false },
};

const PORTAL_LABEL: Record<string, string> = { pos: "Till", students: "Students", parents: "Parents", staff: "Staff" };

/**
 * Pointing a preview deployment at a workspace and one of its addresses.
 *
 * Reachable without a session and outside tenant routing: it is where you go
 * when the deployment is pointed at the wrong workspace, and a page behind the
 * check it exists to fix would be no use. The choice is made here and handed to
 * the proxy as `?__host=` or `?__tenant=`, which stores it and redirects to the
 * clean address.
 */
export default async function PreviewHostPage({
  searchParams,
}: {
  searchParams: Promise<{ invalid?: string; ws?: string; portal?: string }>;
}) {
  const { invalid, ws, portal } = await searchParams;
  const overrideEnabled = isPreviewHostOverrideEnabled();
  const rootDomain = process.env.PLATFORM_ROOT_DOMAIN?.trim().toLowerCase() || null;
  const prefixes = getPortalHostPrefixes();

  // The workspace-and-address form: one host, handed to the proxy.
  if (ws !== undefined && overrideEnabled) {
    const slug = ws.trim().toLowerCase();
    const prefix = portal && prefixes.includes(portal) ? portal : "";
    if (slug && rootDomain) {
      redirect(
        prefix
          ? `/preview-host?${PREVIEW_HOST_PARAM}=${encodeURIComponent(`${prefix}.${slug}.${rootDomain}`)}`
          : `/preview-host?${PREVIEW_TENANT_PARAM}=${encodeURIComponent(slug)}`,
      );
    }
  }

  const requestHeaders = await headers();
  const realHost = getRealHostHeaderFromRequestHeaders(requestHeaders);
  const effectiveHost = getHostHeaderFromRequestHeaders(requestHeaders);
  const hostContext = getPlatformHostContext(effectiveHost);
  const tenant = await resolveTenantFromHost(effectiveHost);
  const enforcementBypassed = isHostEnforcementBypassed();
  const isOverridden = Boolean(realHost && effectiveHost && realHost !== effectiveHost);
  const portalLabel = hostContext.portalCanonicalPrefix ? PORTAL_LABEL[hostContext.portalCanonicalPrefix] ?? hostContext.portalCanonicalPrefix : null;
  const workspaceName = tenant?.companyName ?? hostContext.tenantSlug;
  // The till first after the workspace: it is the address a preview is most often pointed at.
  const portals = [
    { prefix: "", label: "Workspace" },
    ...[...prefixes]
      .sort((a, b) => Number(b === "pos") - Number(a === "pos"))
      .map((prefix) => ({ prefix, label: PORTAL_LABEL[prefix] ?? prefix })),
  ];
  const disabled = !overrideEnabled;
  // The refused address without its scheme, so the error can quote the page on the end.
  const invalidPath = invalid?.replace(/^https?:\/\//i, "") ?? "";

  return (
    <TillRoot fontClass={`${tillSans.variable} ${tillMono.variable}`}>
      <main className="main is-page">
        <div className="page is-centred">
          <div className="stack-8">
            <div className="who-head">
              <h1 className="text-title">Preview host</h1>
              {isOverridden && workspaceName ? (
                <span className="status status-live">
                  {workspaceName}’s {(portalLabel ?? "workspace").toLowerCase()}
                </span>
              ) : (
                <span className="status">No override</span>
              )}
            </div>
            {disabled ? (
              <div className="banner banner-danger is-card">
                <WarningCircle className="ic" />
                <span>
                  <b className="weight-500">The override is off on this deployment.</b> Set PREVIEW_HOST_OVERRIDE to 1 on it.
                  Production never takes one.
                </span>
              </div>
            ) : isOverridden ? (
              <>
                <p className="lede-figure lede-20">
                  This preview is {workspaceName ?? "a workspace"}’s {(portalLabel ?? "workspace").toLowerCase()}.{" "}
                  <span className="q">
                    Every page answers as <span className="num">{effectiveHost}</span> until you clear it.
                  </span>
                </p>
                <div className="actions under">
                  {/* The till's door is its root: the proxy shows /pair to a device with no key, "Who is selling?" to a till. */}
                  <Link className="btn btn-primary btn-lg" href={portalLabel === "Till" ? "/" : "/login"}>
                    <CaretRight className="ic" />
                    {portalLabel === "Till" ? "Go to the till’s door" : "Go to sign-in"}
                  </Link>
                  <Link className="btn btn-lg" href={`/preview-host?${PREVIEW_HOST_PARAM}=`}>
                    <X className="ic" />
                    Clear it
                  </Link>
                </div>
              </>
            ) : (
              <p className="lede-figure lede-20">
                This preview answers on <span className="num">{realHost}</span>.{" "}
                <span className="q">
                  That address belongs to no workspace, so say which one it stands for. Sign-in, the till and the portals then
                  behave as they will on the real address.
                </span>
              </p>
            )}
          </div>

          {isOverridden ? <hr className="divider" /> : null}

          <div className="form-sec">
            <header>
              <h2>Treat it as</h2>
              <p>A workspace, and which of its addresses.</p>
            </header>
            <div className="body">
              <PortalChoice
                portals={portals}
                initialSlug={hostContext.tenantSlug ?? ""}
                initialPortal={hostContext.portalCanonicalPrefix ?? "pos"}
                rootDomain={rootDomain}
                disabled={disabled}
                quiet={isOverridden}
              />
            </div>
          </div>
          <hr className="divider" />

          <div className="form-sec">
            <header>
              <h2>Or a whole address</h2>
              <p>Taken as written, portal prefix and all.</p>
            </header>
            <div className="body">
              <form method="get" action="/preview-host" className="field">
                <label htmlFor="preview-host-address">Address</label>
                <div className="actions">
                  <input
                    id="preview-host-address"
                    name={PREVIEW_HOST_PARAM}
                    className="input input-lg num text-left grow"
                    placeholder={rootDomain ? `pos.acme.${rootDomain}` : "pos.acme.example.com"}
                    defaultValue={invalid ?? ""}
                    inputMode="url"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={disabled}
                    aria-invalid={invalid ? true : undefined}
                    aria-describedby={invalid ? "preview-host-address-error" : undefined}
                  />
                  <button type="submit" className="btn btn-lg" disabled={disabled}>
                    <Check className="ic" />
                    Use address
                  </button>
                </div>
                {invalid ? (
                  <span className="error" id="preview-host-address-error">
                    <WarningCircle className="ic" />
                    {invalidPath.includes("/")
                      ? `That is an address with a page on the end. Leave off ${invalidPath.slice(invalidPath.indexOf("/"))}.`
                      : "This deployment does not take that address. Check the spelling, and the allowlist if one is set."}
                  </span>
                ) : (
                  <span className="help">
                    Any page takes <span className="num">?{PREVIEW_HOST_PARAM}=</span> or <span className="num">?{PREVIEW_TENANT_PARAM}=</span> too. It is
                    kept and dropped from the address, so a link you share never carries it.
                  </span>
                )}
              </form>
            </div>
          </div>
          <hr className="divider" />

          <div className="form-sec">
            <header>
              <h2>Right now</h2>
            </header>
            <div className="body">
              <dl className="attrs is-wide">
                <dt>Real address</dt>
                <dd className="num text-left">
                  {realHost ?? "Unknown"}
                </dd>
                <dt>Treated as</dt>
                <dd className="num text-left">
                  {effectiveHost ?? "Unknown"}
                </dd>
                <dt>Root domain</dt>
                <dd className="num text-left">
                  {rootDomain ?? "Not set: workspace addresses are off"}
                </dd>
                <dt>Workspace</dt>
                <dd>{workspaceName ?? "None"}</dd>
                <dt>Portal</dt>
                <dd>{portalLabel ? `The ${portalLabel.toLowerCase()}` : "None, the main workspace"}</dd>
                <dt>Host checks</dt>
                <dd>{enforcementBypassed ? "Bypassed" : hostContext.strictTenantEnforcement ? "On" : "Off"}</dd>
              </dl>
            </div>
          </div>
        </div>
      </main>
    </TillRoot>
  );
}
