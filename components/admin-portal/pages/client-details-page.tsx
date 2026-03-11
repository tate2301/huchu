"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, RefreshCw, ShieldCheck, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/ui/status-chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchCompanies } from "@/components/admin-portal/api";
import {
  getEnrichedClient,
  getFeaturesForClient,
  getPricingBreakdown,
  type EnrichedClient,
} from "./client-data";
import { FEATURE_BUNDLES, TIERS } from "@/lib/platform/feature-catalog";

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}`;
}

export function ClientDetailsPage({ companyId }: { companyId: string }) {
  const [client, setClient] = useState<EnrichedClient | undefined>();
  const [addons, setAddons] = useState<Set<string>>(new Set());
  const [referenceNow] = useState(() => Date.now());

  useEffect(() => {
    void fetchCompanies()
      .then((companies) => {
        const enriched = getEnrichedClient(companies, companyId);
        setClient(enriched);
        setAddons(new Set(enriched?.addonCodes ?? []));
      })
      .catch(() => setClient(undefined));
  }, [companyId]);

  const pricing = useMemo(() => (client ? getPricingBreakdown({ ...client, addonCodes: Array.from(addons) }) : null), [addons, client]);
  const includedFeatures = useMemo(() => (client ? getFeaturesForClient({ ...client, addonCodes: Array.from(addons) }) : []), [addons, client]);

  const siteRows = useMemo(
    () => {
      if (!client) return [];
      return Array.from({ length: Math.max(1, client.activeSites) }).map((_, index) => ({
        name: `${client.name} Site ${index + 1}`,
        tier: client.tierName,
        status: index === 0 ? "PRIMARY" : "ACTIVE",
        lastSeen: new Date(referenceNow - index * 36_000_00).toLocaleString(),
      }));
    },
    [client, referenceNow],
  );

  const auditRows = useMemo(
    () =>
      client
        ? [
            { id: "au1", action: "Change Tier", target: client.name, actor: "alice@ops.team", status: "SUCCESS", at: "Today 10:24" },
            { id: "au2", action: "Enable Add-on", target: "Analytics Pro", actor: "alice@ops.team", status: "SUCCESS", at: "Today 10:22" },
            { id: "au3", action: "Support Login", target: client.name, actor: "support@pagka.dev", status: "PENDING", at: "Today 09:55" },
          ]
        : [],
    [client],
  );

  if (!client) {
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-semibold">Client not found</h1>
        <p className="text-sm text-[var(--text-muted)]">Select a client from the list to view details.</p>
        <Button asChild>
          <Link href="/admin/clients">Back to clients</Link>
        </Button>
      </section>
    );
  }

  const statusMap: Record<string, string> = {
    ACTIVE: "Active",
    EXPIRING_SOON: "Expiring Soon",
    IN_GRACE: "In Grace",
    PAST_DUE: "Past Due",
    CANCELED: "Canceled",
  };

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Client</p>
            <h1 className="text-2xl font-semibold">{client.name}</h1>
            <p className="text-sm text-[var(--text-muted)]">
              Guided controls for plan, add-ons, features, support access, and audit. Safe defaults, no raw toggles unless advanced.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-medium">{client.tierName}</Badge>
            <StatusChip status={client.status} />
            <Badge variant="secondary" className="font-mono">{formatCurrency(client.monthlyAmount)}/mo</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild><Link href={`/admin/clients/${client.id}#subscription`}>Change Tier</Link></Button>
          <Button size="sm" variant="outline" asChild><Link href={`/admin/clients/${client.id}#addons`}>Manage Add-ons</Link></Button>
          <Button size="sm" variant="outline"><RefreshCw className="mr-2 h-4 w-4" />Recompute Pricing</Button>
          <Button size="sm" variant="outline" asChild><Link href="/admin/templates"><Wand2 className="mr-2 h-4 w-4" />Apply Template</Link></Button>
          <Button size="sm"><ShieldCheck className="mr-2 h-4 w-4" />Enable Support Access</Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-3">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="addons">Add-ons</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardDescription>Plan Level</CardDescription>
                <CardTitle className="text-lg">{client.tierName}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-[var(--text-muted)]">
                {statusMap[client.status]}. {client.activeSites} active sites. Add-ons: {client.addonCodes.length || "None"}.
              </CardContent>
            </Card>
            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardDescription>Monthly Amount</CardDescription>
                <CardTitle className="text-lg font-mono">{formatCurrency(pricing?.total ?? client.monthlyAmount)}/mo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-[var(--text-muted)]">
                <p>Tier base: {formatCurrency(pricing?.tierBase ?? 0)}</p>
                <p>Site overage: {formatCurrency(pricing?.siteOverage ?? 0)}</p>
                <p>Add-ons: {formatCurrency((pricing?.addonBaseTotal ?? 0) + (pricing?.addonSiteTotal ?? 0))}</p>
              </CardContent>
            </Card>
            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardDescription>Last Updated</CardDescription>
                <CardTitle className="text-lg">{new Date(client.lastUpdated).toLocaleString()}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-[var(--text-muted)]">Platform-managed with safe defaults and audit trail.</CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="subscription" className="space-y-3" id="subscription">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardTitle className="text-base">Plan</CardTitle>
                <CardDescription>Plan level, base price, and included sites.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="font-medium">Current Tier:</span> {client.tierName}</p>
                <p><span className="font-medium">Base Price:</span> {formatCurrency(pricing?.tierBase ?? 0)}/month</p>
                <p><span className="font-medium">Included Sites:</span> {TIERS.find((tier) => tier.code === client.tierCode)?.includedSites ?? 0}</p>
                <p><span className="font-medium">Additional Site Price:</span> {formatCurrency(TIERS.find((tier) => tier.code === client.tierCode)?.additionalSiteMonthlyPrice ?? 0)}/site</p>
              </CardContent>
            </Card>
            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardTitle className="text-base">Site Usage</CardTitle>
                <CardDescription>Included vs active sites with overage.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p><span className="font-medium">Active Sites:</span> {client.activeSites}</p>
                <p><span className="font-medium">Included Sites:</span> {TIERS.find((tier) => tier.code === client.tierCode)?.includedSites ?? 0}</p>
                <p><span className="font-medium">Overage Sites:</span> {Math.max(0, client.activeSites - (TIERS.find((tier) => tier.code === client.tierCode)?.includedSites ?? 0))}</p>
                <p><span className="font-medium">Overage Cost:</span> {formatCurrency(pricing?.siteOverage ?? 0)}/month</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Billing Snapshot</CardTitle>
              <CardDescription>Applies platform formula: tier_base + tier_site_overage + addon_base_total + addon_site_total.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Base Plan</p>
                <p className="text-lg font-mono">{formatCurrency(pricing?.tierBase ?? 0)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Site Overage</p>
                <p className="text-lg font-mono">{formatCurrency(pricing?.siteOverage ?? 0)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Add-ons</p>
                <p className="text-lg font-mono">
                  {formatCurrency((pricing?.addonBaseTotal ?? 0) + (pricing?.addonSiteTotal ?? 0))}
                </p>
              </div>
              <div className="space-y-1 md:col-span-3">
                <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Total</p>
                <p className="text-2xl font-mono">{formatCurrency(pricing?.total ?? client.monthlyAmount)}/month</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="addons" className="space-y-3" id="addons">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {FEATURE_BUNDLES.map((bundle) => {
              const enabled = addons.has(bundle.code);
              return (
                <Card key={bundle.code} className="border-[var(--border)]">
                  <CardHeader className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">{bundle.name}</CardTitle>
                        <CardDescription>{bundle.description}</CardDescription>
                      </div>
                      <Badge variant={enabled ? "secondary" : "outline"}>{enabled ? "Enabled" : "Disabled"}</Badge>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      Base: {formatCurrency(bundle.monthlyPrice)} · Per site: {formatCurrency(bundle.additionalSiteMonthlyPrice)}/site
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Features Included</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
                      {bundle.features.slice(0, 4).map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant={enabled ? "outline" : "default"} onClick={() => {
                        setAddons((current) => {
                          const next = new Set(current);
                          if (enabled) {
                            next.delete(bundle.code);
                          } else {
                            next.add(bundle.code);
                          }
                          return next;
                        });
                      }}>
                        {enabled ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link href="/admin/feature-catalog">View feature access</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="features" className="space-y-3" id="features">
          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Feature Access</CardTitle>
              <CardDescription>Derived from tier and enabled add-ons. Advanced mode toggles are gated.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Feature Name</th>
                    <th className="px-3 py-2">Key</th>
                    <th className="px-3 py-2">Billable</th>
                    <th className="px-3 py-2">Default Enabled</th>
                    <th className="px-3 py-2">Domain</th>
                  </tr>
                </thead>
                <tbody>
                  {includedFeatures.map((feature) => (
                    <tr key={feature.key} className="border-t">
                      <td className="px-3 py-2">{feature.name}</td>
                      <td className="px-3 py-2 font-mono text-xs">{feature.key}</td>
                      <td className="px-3 py-2">{feature.isBillable ? "Yes" : "No"}</td>
                      <td className="px-3 py-2">{feature.defaultEnabled ? "Yes" : "No"}</td>
                      <td className="px-3 py-2 text-xs uppercase tracking-wide text-[var(--text-muted)]">{feature.domain}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sites" className="space-y-3">
          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Sites</CardTitle>
              <CardDescription>Site list with status and recent activity.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Site</th>
                    <th className="px-3 py-2">Tier</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {siteRows.map((site) => (
                    <tr key={site.name} className="border-t">
                      <td className="px-3 py-2">{site.name}</td>
                      <td className="px-3 py-2">{site.tier}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{site.status}</Badge></td>
                      <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{site.lastSeen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="space-y-3" id="usage">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardDescription>Monthly Usage</CardDescription>
                <CardTitle className="text-lg font-mono">{client.activeSites * 12} site credits</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-[var(--text-muted)]">Usage-based pricing ready for future modules.</CardContent>
            </Card>
            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardDescription>Support Sessions</CardDescription>
                <CardTitle className="text-lg font-mono">2 active</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-[var(--text-muted)]">Support access expires automatically after set duration.</CardContent>
            </Card>
            <Card className="border-[var(--border)]">
              <CardHeader>
                <CardDescription>Health Score</CardDescription>
                <CardTitle className="text-lg font-mono">92/100</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-[var(--text-muted)]">Includes billing, entitlement sync, and usage signals.</CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="space-y-3" id="audit">
          <Card className="border-[var(--border)]">
            <CardHeader>
              <CardTitle className="text-base">Audit Log</CardTitle>
              <CardDescription>Operator, target, changes, and timestamp. Filters by actor/client/action.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Operator</th>
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Target</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2 font-mono">{row.actor}</td>
                      <td className="px-3 py-2">{row.action}</td>
                      <td className="px-3 py-2">{row.target}</td>
                      <td className="px-3 py-2"><StatusChip status={row.status} /></td>
                      <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{row.at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-muted)]">
        <ArrowRight className="h-4 w-4" />
        When add-ons change, the portal updates bundles, recomputes entitlements, and refreshes the price snapshot automatically.
      </div>
    </section>
  );
}
