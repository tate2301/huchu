"use client";

import { useMemo, useState } from "react";
import { ToggleLeft, ToggleRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FEATURE_BUNDLES } from "@/lib/platform/feature-catalog";

function formatCurrency(value: number) {
  return `$${value.toLocaleString()}`;
}

export function AddonsPage() {
  const [enabled, setEnabled] = useState<Set<string>>(new Set(["ADDON_CCTV_SUITE", "ADDON_ANALYTICS_PRO"]));
  const siteCount = 3;

  const totals = useMemo(() => {
    let base = 0;
    let perSite = 0;
    enabled.forEach((code) => {
      const bundle = FEATURE_BUNDLES.find((item) => item.code === code);
      if (!bundle) return;
      base += bundle.monthlyPrice;
      perSite += bundle.additionalSiteMonthlyPrice * siteCount;
    });
    return { base, perSite, total: base + perSite };
  }, [enabled, siteCount]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Add-ons</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Toggle cards aligned with catalog. Enabling auto-enables feature flags and recomputes pricing.
        </p>
      </div>

      <Card className="border-[var(--border)]">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-base">Pricing summary</CardTitle>
            <CardDescription>tier_base + tier_site_overage + addon_base_total + addon_site_total + standalone_feature_total</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary" className="font-mono">Add-on base: {formatCurrency(totals.base)}</Badge>
            <Badge variant="secondary" className="font-mono">Per-site: {formatCurrency(totals.perSite)}</Badge>
            <Badge className="font-mono">Total: {formatCurrency(totals.total)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {FEATURE_BUNDLES.map((bundle) => {
            const isEnabled = enabled.has(bundle.code);
            return (
              <Card key={bundle.code} className="border-[var(--border)]">
                <CardHeader className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{bundle.name}</CardTitle>
                      <CardDescription>{bundle.description}</CardDescription>
                    </div>
                    <Badge variant={isEnabled ? "secondary" : "outline"}>{isEnabled ? "Enabled" : "Disabled"}</Badge>
                  </div>
                  <p className="text-xs text-[var(--text-muted)]">
                    Base: {formatCurrency(bundle.monthlyPrice)} · Per site: {formatCurrency(bundle.additionalSiteMonthlyPrice)}/site
                  </p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Features Included</p>
                  <ul className="list-disc space-y-1 pl-5 text-[var(--text-muted)]">
                    {bundle.features.slice(0, 4).map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                    {bundle.features.length > 4 ? <li>+{bundle.features.length - 4} more</li> : null}
                  </ul>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={isEnabled ? "outline" : "default"}
                      onClick={() => {
                        setEnabled((current) => {
                          const next = new Set(current);
                          if (isEnabled) {
                            next.delete(bundle.code);
                          } else {
                            next.add(bundle.code);
                          }
                          return next;
                        });
                      }}
                    >
                      {isEnabled ? <ToggleLeft className="mr-2 h-4 w-4" /> : <ToggleRight className="mr-2 h-4 w-4" />}
                      {isEnabled ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="ghost">View dependencies</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}
