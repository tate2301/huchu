"use client";

import { useMemo, useState } from "react";
import { FEATURE_CATALOG } from "@/lib/platform/feature-catalog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FeatureCatalogPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const rows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return FEATURE_CATALOG;
    return FEATURE_CATALOG.filter(
      (feature) =>
        feature.name.toLowerCase().includes(term) ||
        feature.key.toLowerCase().includes(term) ||
        feature.domain.toLowerCase().includes(term),
    );
  }, [searchTerm]);

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Feature Catalog</h1>
        <p className="text-sm text-[var(--text-muted)]">Read-only catalog; advanced mode allows manual toggles when needed.</p>
      </div>

      <Card className="border-[var(--border)]">
        <CardHeader className="space-y-3">
          <div>
            <CardTitle className="text-base">Features</CardTitle>
            <CardDescription>Feature Name · Feature Key · Billable · Default Enabled · Bundle · Routes</CardDescription>
          </div>
          <div className="md:w-80">
            <Label className="sr-only">Search features</Label>
            <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search name, key, or domain" />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-muted)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
              <tr>
                <th className="px-3 py-2">Feature Name</th>
                <th className="px-3 py-2">Feature Key</th>
                <th className="px-3 py-2">Billable</th>
                <th className="px-3 py-2">Default Enabled</th>
                <th className="px-3 py-2">Domain</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((feature) => (
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
    </section>
  );
}
